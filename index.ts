import express from 'express'
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config'
import cors from "cors"
import { betterAuth } from "better-auth"
import { mongodbAdapter } from "@better-auth/mongo-adapter"
import { fromNodeHeaders } from "better-auth/node"


const app = express()
const PORT = 8000


app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
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


// Same better-auth setup as the Next.js app (same database and secret),
// so the session cookie created by the web app can be verified here.
const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  trustedOrigins: [process.env.CLIENT_URL || "http://localhost:3000"],
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


app.post('/create-event', async (req, res) => {

  const user = await getSessionUser(req)

  if (!user) {
    return res.status(401).send({
      message: "You must be logged in to create an event."
    })
  }

  const data = {
    ...req.body,
    creatorEmail: user.email,
    createdAt: new Date().toISOString(),
  }

  const result = await eventCollection?.insertOne(data)

  console.log(result);

  res.send(result)
})


app.get('/events', async (req, res) => {
  const result = await eventCollection?.find().toArray()
  res.send(result)
})


app.get('/event/:id', async (req, res) => {
  const { id } = req.params

  const result = await eventCollection?.findOne({
    _id: new ObjectId(id)
  })

  res.send(result)
})


// Join an event - only logged in users can join
app.post('/join-event', async (req, res) => {

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
app.get('/event/:id/joined', async (req, res) => {

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
app.get('/joined-events', async (req, res) => {

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


app.get('/my-events', async (req, res) => {

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



app.patch('/update-event/:id', async (req, res) => {

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

  const updatedData = {
    title,
    eventType,
    description,
    image,
    location,
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


app.delete('/delete-event/:id', async (req, res) => {

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

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`)
})
