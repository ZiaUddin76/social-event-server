import express from 'express'
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config'
import cors from "cors"
import { betterAuth } from "better-auth"
import { mongodbAdapter } from "@better-auth/mongo-adapter"
import { fromNodeHeaders } from "better-auth/node"
import { createRemoteJWKSet, jwtVerify } from 'jose';


const app = express()
const PORT = 8000


app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}))
app.use(express.json())


const client = new MongoClient(process.env.MONGODB_URI!);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}


const mongoClient = await connectToMongoDB();

const db = mongoClient?.db("social-work")

const eventCollection = db?.collection("event")
const joinedEvent = db?.collection("joined")


const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if(!authHeader) {
    return res.status(401).send({ message: "Unauthorized!" });
  }

  const token = authHeader.split(" ")[1]

  if(!token) {
    return res.status(401).send({ message: "Unauthorized!" });
  }


  try {
    await jwtVerify(token, JWKS)
  } catch (error) {
    return res.status(401).send({ message: "Invalid or expired token." });
  }

  next();

};




// Same better-auth setup as the Next.js app (same database and secret),
// so the session cookie created by the web app can be verified here.
const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.CLIENT_URL],
  database: mongodbAdapter(db!, { client: mongoClient! }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    maxPasswordLength: 128,
  },
})


// Returns the logged in user from the browser session cookie, or null.
const getSessionUser = async (req: express.Request) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  return session?.user ?? null
}




app.post('/create-event',
  verifyToken,
  async (req, res) => {

  const user = await getSessionUser(req)

  if (!user) {
    return res.status(401).send({
      message: "You must be logged in to create an event."
    })
  }

  const {
    title,
    eventType,
    description,
    image,
    location,
    eventDate,
  } = req.body

  // Validate title
  if (
    typeof title !== "string" ||
    title.trim().length < 5 ||
    title.trim().length > 100
  ) {
    return res.status(400).send({
      message: "Title must be between 5 and 100 characters."
    })
  }

  // Validate event type
  const eventTypes = [
    "Cleanup",
    "Plantation",
    "Donation",
    "Awareness",
    "Community Service",
    "Education",
    "Other",
  ]

  if (
    typeof eventType !== "string" ||
    !eventTypes.includes(eventType)
  ) {
    return res.status(400).send({
      message: "Please select a valid event type."
    })
  }

  // Validate description
  if (
    typeof description !== "string" ||
    description.trim().length < 20 ||
    description.trim().length > 1000
  ) {
    return res.status(400).send({
      message: "Description must be between 20 and 1000 characters."
    })
  }

  // Validate location
  if (
    typeof location !== "string" ||
    location.trim().length < 3 ||
    location.trim().length > 150
  ) {
    return res.status(400).send({
      message: "Location must be between 3 and 150 characters."
    })
  }

  // Validate image URL
  if (typeof image !== "string" || !image.trim()) {
    return res.status(400).send({
      message: "Please provide an image URL."
    })
  }

  try {
    const imageUrl = new URL(image.trim())

    if (
      imageUrl.protocol !== "http:" &&
      imageUrl.protocol !== "https:"
    ) {
      throw new Error("Invalid image URL")
    }
  } catch {
    return res.status(400).send({
      message: "Please provide a valid image URL."
    })
  }

  // Validate event date
  if (
    typeof eventDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)
  ) {
    return res.status(400).send({
      message: "Please provide a valid event date."
    })
  }

  const [year, month, day] = eventDate.split("-").map(Number)

  const selectedDate = new Date(
    Date.UTC(year, month - 1, day)
  )

  const isValidDate =
    selectedDate.getUTCFullYear() === year &&
    selectedDate.getUTCMonth() === month - 1 &&
    selectedDate.getUTCDate() === day

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const minimumDate = [
    tomorrow.getFullYear(),
    String(tomorrow.getMonth() + 1).padStart(2, "0"),
    String(tomorrow.getDate()).padStart(2, "0"),
  ].join("-")

  if (
    !isValidDate ||
    eventDate < minimumDate
  ) {
    return res.status(400).send({
      message: "Event date must be tomorrow or later."
    })
  }

  // Prepare validated event data
  const data = {
    title: title.trim(),
    eventType,
    description: description.trim(),
    image: image.trim(),
    location: location.trim(),
    eventDate,
    creatorEmail: user.email,
    createdAt: new Date().toISOString(),
  }

  const result = await eventCollection?.insertOne(data)

  console.log(result)

  res.send(result)
})




app.get('/events', async (req, res) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-")

  const result = await eventCollection
    ?.find({ eventDate: { $gte: todayString } })
    .sort({ eventDate: 1 })
    .toArray()

  res.send(result)
})


app.get('/event/:id',
  async (req, res) => {
  const { id } = req.params

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({
      message: "Invalid event ID."
    })
  }

  const result = await eventCollection?.findOne({
    _id: new ObjectId(id)
  })

  if (!result) {
    return res.status(404).send({
      message: "Event not found."
    })
  }

  res.send(result)
})


// Join an event - only logged in users can join
app.post('/join-event',
  verifyToken,
  async (req, res) => {

  const user = await getSessionUser(req)

  if (!user) {
    return res.status(401).send({ message: "You must be logged in to join this event." })
  }

  const { eventId } = req.body as { eventId?: string }

  if (!eventId || !ObjectId.isValid(eventId)) {
    return res.status(400).send({ message: "Invalid event id." })
  }

  const event = await eventCollection?.findOne({ _id: new ObjectId(eventId) })

  if (!event) {
    return res.status(404).send({ message: "Event not found." })
  }

  const alreadyJoined = await joinedEvent?.findOne({
    eventId,
    userId: user.id,
  })

  if (alreadyJoined) {
    return res.status(409).send({ message: "You have already joined this event." })
  }

  const result = await joinedEvent?.insertOne({
    eventId,
    eventTitle: event.title,
    eventDate: event.eventDate,
    eventType: event.eventType,
    location: event.location,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    joinedAt: new Date().toISOString(),
    image: event.image,
  })

  res.status(201).send(result)
})


// Check if the logged in user has already joined an event
app.get('/event/:id/joined',
  verifyToken,
  async (req, res) => {

  const user = await getSessionUser(req)

  if (!user) {
    return res.send({ joined: false })
  }

  const joined = await joinedEvent?.findOne({
    eventId: req.params.id,
    userId: user.id,
  })

  res.send({ joined: Boolean(joined) })
})


// All events joined by the logged in user - newest first
app.get('/joined-events',
  verifyToken,
  async (req, res) => {

  const user = await getSessionUser(req)

  if (!user) {
    return res.status(401).send({ message: "You must be logged in to view your joined events." })
  }

  const result = await joinedEvent
    ?.find({ userId: user.id })
    .sort({ eventDate: 1 })
    .toArray()

  res.send(result)
})


app.get('/my-events',
  verifyToken,
  async (req, res) => {

  const user = await getSessionUser(req)

  if (!user) {
    return res.status(401).send({
      message: "You must be logged in to view your events."
    })
  }

  const result = await eventCollection
    ?.find({ creatorEmail: user.email })
    .sort({ eventDate: 1 })
    .toArray()

  res.send(result)
})



app.patch('/update-event/:id',
  verifyToken,
  async (req, res) => {

  const user = await getSessionUser(req)

  if (!user) {
    return res.status(401).send({
      message: "You must be logged in to update an event."
    })
  }


  const { id } = req.params

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({
      message: "Invalid event ID."
    })
  }

  const { title, eventType, description, image, location, eventDate } = req.body

  // Validate title
  if (
    typeof title !== "string" ||
    title.trim().length < 5 ||
    title.trim().length > 100
  ) {
    return res.status(400).send({
      message: "Title must be between 5 and 100 characters."
    })
  }

  // Validate event type
  const allowedEventTypes = [
    "Cleanup",
    "Plantation",
    "Donation",
    "Awareness",
    "Community Service",
    "Education",
    "Other"
  ]

  if (!allowedEventTypes.includes(eventType)) {
    return res.status(400).send({
      message: "Invalid event type."
    })
  }

  // Validate description
  if (
    typeof description !== "string" ||
    description.trim().length < 20 ||
    description.trim().length > 1000
  ) {
    return res.status(400).send({
      message: "Description must be between 20 and 1000 characters."
    })
  }

  // Validate location
  if (
    typeof location !== "string" ||
    location.trim().length < 3 ||
    location.trim().length > 150
  ) {
    return res.status(400).send({
      message: "Location must be between 3 and 150 characters."
    })
  }

  // Validate image URL
  try {
    const imageUrl = new URL(image)

    if (
      typeof image !== "string" ||
      !["http:", "https:"].includes(imageUrl.protocol)
    ) {
      throw new Error("Invalid image URL")
    }
  } catch {
    return res.status(400).send({
      message: "Please provide a valid image URL."
    })
  }

  // Validate event date
  if (
    typeof eventDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)
  ) {
    return res.status(400).send({
      message: "Please provide a valid event date."
    })
  }

  const [year, month, day] = eventDate.split("-").map(Number)

  const selectedDate = new Date(
    Date.UTC(year, month - 1, day)
  )

  const isValidDate =
    selectedDate.getUTCFullYear() === year &&
    selectedDate.getUTCMonth() === month - 1 &&
    selectedDate.getUTCDate() === day

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const minimumDate = [
    tomorrow.getFullYear(),
    String(tomorrow.getMonth() + 1).padStart(2, "0"),
    String(tomorrow.getDate()).padStart(2, "0"),
  ].join("-")

  if (!isValidDate || eventDate < minimumDate) {
    return res.status(400).send({
      message: "Event date must be tomorrow or later."
    })
  }


  const updatedData = {
    title: title.trim(),
    eventType,
    description: description.trim(),
    image,
    location: location.trim(),
    eventDate,
  }

  const result = await eventCollection?.updateOne(
    {
      _id: new ObjectId(id),
      creatorEmail: user.email
    },
    {
      $set: updatedData
    }
  )

  if (result?.matchedCount === 0) {
    return res.status(404).send({
      message: "Event not found."
    })
  }

  res.send({
    message: "Event updated successfully."
  })
})


app.delete('/delete-event/:id',
  verifyToken,
  async (req, res) => {

  const user = await getSessionUser(req)

  if (!user) {
    return res.status(401).send({
      message: "You must be logged in to delete an event."
    })
  }

  const { id } = req.params

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({
      message: "Invalid event ID."
    })
  }

  const result = await eventCollection?.deleteOne({
    _id: new ObjectId(id),
    creatorEmail: user.email
  })

  if (result?.deletedCount === 0) {
    return res.status(404).send({
      message: "Event not found."
    })
  }

  res.send({
    message: "Event deleted successfully."
  })
})



app.get('/', (req, res) => {
  res.send({ message: 'Server is running fine' })
})


// Global error-handling middleware
app.use((
  err: Error,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  console.error("Server Error:", err)

  if (res.headersSent) {
    return next(err)
  }

  res.status(500).send({
    message: "Internal server error."
  })
})


// app.listen(PORT, () => {
//   console.log(`Server is running at ${PORT}`)
// })


export default app