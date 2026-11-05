import express, {
    type Request,
    type Response,
    type NextFunction,
    type RequestHandler,
} from "express"

import { MongoClient, ObjectId } from "mongodb"
import "dotenv/config"
import cors from "cors"
import { createRemoteJWKSet, jwtVerify } from "jose"


const app = express()


// ========================================
// Environment variables
// ========================================

const getRequiredEnv = (name: string): string => {
    const value = process.env[name]

    if (!value) {
        throw new Error(`Missing environment variable: ${name}`)
    }

    return value
}

const MONGODB_URI = getRequiredEnv("MONGODB_URI")

// CLIENT_URL is the frontend (Next.js) origin. It is used for CORS and for
// fetching the JWKS public keys, because better-auth runs inside the frontend
// at <CLIENT_URL>/api/auth.
const CLIENT_URL = getRequiredEnv("CLIENT_URL").replace(/\/$/, "")

// BETTER_AUTH_URL must be the SAME URL as the frontend app, because that is
// where better-auth issues the JWTs. The JWT "iss" and "aud" claims are set to
// this URL, so if this does not match the frontend URL exactly (including
// http/https and the port), every authenticated request fails with 401.
const BETTER_AUTH_URL = getRequiredEnv("BETTER_AUTH_URL").replace(/\/$/, "")

if (BETTER_AUTH_URL !== CLIENT_URL) {
    console.warn(
        `[config] BETTER_AUTH_URL (${BETTER_AUTH_URL}) and CLIENT_URL (${CLIENT_URL}) ` +
        "are different. better-auth runs inside the frontend app, so JWTs are " +
        "issued with issuer/audience set to the frontend URL. If these do not " +
        "match, every authenticated request will fail with 401."
    )
}


// ========================================
// Express middleware
// ========================================

app.use(cors({
    origin: CLIENT_URL,
    credentials: true,
}))

app.use(express.json())


// ========================================
// MongoDB connection
// ========================================

const client = new MongoClient(MONGODB_URI)

export async function connectToMongoDB() {
    try {
        await client.connect()

        console.log("You successfully connected to MongoDB!")

        return client
    } catch (err) {
        console.error("MongoDB connection failed:", err)
        throw err
    }
}

const mongoClient = await connectToMongoDB()

const db = mongoClient.db("social-work")

const eventCollection = db.collection("event")
const joinedEvent = db.collection("joined")


// ========================================
// Async error handler
// ========================================

type AsyncRouteHandler = (
    req: Request,
    res: Response,
    next: NextFunction
) => Promise<void>

const asyncHandler = (
    handler: AsyncRouteHandler
): RequestHandler => {
    return (req, res, next) => {
        handler(req, res, next).catch(next)
    }
}


// ========================================
// Route parameter helper
// ========================================

const getRouteParam = (
    req: Request,
    name: string
): string => {
    const value = req.params[name]

    return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}


// ========================================
// Authenticated user type
// ========================================

type AuthenticatedUser = {
    id: string
    email: string
    name: string
}


// ========================================
// JWT verification
// ========================================

const JWKS = createRemoteJWKSet(
    new URL(`${CLIENT_URL}/api/auth/jwks`)
)

const verifyToken: RequestHandler = asyncHandler(
    async (req, res, next) => {

        const authHeader = req.headers.authorization

        if (!authHeader) {
            res.status(401).send({
                message: "Unauthorized!",
            })
            return
        }

        const [scheme, token] = authHeader.split(" ")

        if (scheme !== "Bearer" || !token) {
            res.status(401).send({
                message: "Invalid authorization header.",
            })
            return
        }

        try {
            const { payload } = await jwtVerify(token, JWKS, {
                issuer: BETTER_AUTH_URL,
                audience: BETTER_AUTH_URL,
            })

            if (
                typeof payload.sub !== "string" ||
                typeof payload.email !== "string"
            ) {
                res.status(401).send({
                    message: "Invalid token payload.",
                })
                return
            }

            const user: AuthenticatedUser = {
                id: payload.sub,
                email: payload.email,
                name: typeof payload.name === "string"
                    ? payload.name
                    : "",
            }

            res.locals.user = user

        } catch (error) {
            console.error("JWT verification failed:", error)

            const errorCode =
                typeof error === "object" && error !== null && "code" in error
                    ? String((error as { code: unknown }).code)
                    : ""

            // The JWKS public keys could not be downloaded from the frontend.
            // This almost always means CLIENT_URL points to a URL that is not
            // running (e.g. localhost while testing the deployed frontend).
            if (
                error instanceof TypeError ||
                errorCode === "ERR_JWKS_FETCH_FAILED" ||
                errorCode === "ERR_JWKS_INVALID" ||
                errorCode === "ERR_JWKS_TIMEOUT" ||
                errorCode === "ERR_JWKS_MULTIPLE_MATCHING_KIDS"
            ) {
                console.error(
                    `Could not load JWKS from ${CLIENT_URL}/api/auth/jwks. ` +
                    "Check that CLIENT_URL points to the running frontend app."
                )

                res.status(401).send({
                    message: "Authentication service is unreachable.",
                })
                return
            }

            if (errorCode === "ERR_JWT_EXPIRED") {
                res.status(401).send({
                    message: "Your session has expired. Please log in again.",
                })
                return
            }

            // The token was signed correctly but was issued by a different
            // better-auth instance than the one configured here.
            if (
                errorCode === "ERR_JWT_ISSUER_MISMATCH" ||
                errorCode === "ERR_JWT_AUDIENCE_MISMATCH"
            ) {
                console.error(
                    `Token issuer/audience mismatch. This server expects ` +
                    `"${BETTER_AUTH_URL}" but the token was issued by a ` +
                    "different URL. Set BETTER_AUTH_URL to the frontend app " +
                    "URL where better-auth runs."
                )

                res.status(401).send({
                    message: "Invalid token issuer.",
                })
                return
            }

            res.status(401).send({
                message: "Invalid or expired token.",
            })
            return
        }

        next()
    }
)


// ========================================
// Get logged-in user
// ========================================

const getSessionUser = (
    res: Response
): AuthenticatedUser | null => {
    return res.locals.user ?? null
}


// ========================================
// Helper functions
// ========================================

const isValidImageUrl = (image: unknown): image is string => {

    if (typeof image !== "string" || !image.trim()) {
        return false
    }

    try {
        const imageUrl = new URL(image.trim())

        return (
            imageUrl.protocol === "http:" ||
            imageUrl.protocol === "https:"
        )

    } catch {
        return false
    }
}


const isValidEventDate = (eventDate: unknown): eventDate is string => {

    if (
        typeof eventDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)
    ) {
        return false
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

    return isValidDate && eventDate >= minimumDate
}


const eventTypes = [
    "Cleanup",
    "Plantation",
    "Donation",
    "Awareness",
    "Community Service",
    "Education",
    "Other",
]


// ========================================
// CREATE EVENT
// ========================================

app.post(
    "/create-event",
    verifyToken,
    asyncHandler(async (req, res) => {

        const user = getSessionUser(res)

        if (!user) {
            res.status(401).send({
                message: "You must be logged in to create an event.",
            })
            return
        }

        const {
            title,
            eventType,
            description,
            image,
            location,
            eventDate,
        } = req.body

        if (
            typeof title !== "string" ||
            title.trim().length < 5 ||
            title.trim().length > 100
        ) {
            res.status(400).send({
                message: "Title must be between 5 and 100 characters.",
            })
            return
        }

        if (
            typeof eventType !== "string" ||
            !eventTypes.includes(eventType)
        ) {
            res.status(400).send({
                message: "Please select a valid event type.",
            })
            return
        }

        if (
            typeof description !== "string" ||
            description.trim().length < 20 ||
            description.trim().length > 1000
        ) {
            res.status(400).send({
                message: "Description must be between 20 and 1000 characters.",
            })
            return
        }

        if (
            typeof location !== "string" ||
            location.trim().length < 3 ||
            location.trim().length > 150
        ) {
            res.status(400).send({
                message: "Location must be between 3 and 150 characters.",
            })
            return
        }

        if (!isValidImageUrl(image)) {
            res.status(400).send({
                message: "Please provide a valid image URL.",
            })
            return
        }

        if (!isValidEventDate(eventDate)) {
            res.status(400).send({
                message: "Event date must be tomorrow or later.",
            })
            return
        }

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

        const result = await eventCollection.insertOne(data)

        console.log(result)

        res.status(201).send(result)
    })
)


// ========================================
// GET ALL UPCOMING EVENTS
// ========================================

app.get(
    "/events",
    asyncHandler(async (req, res) => {

        const today = new Date()

        today.setHours(0, 0, 0, 0)

        const todayString = [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, "0"),
            String(today.getDate()).padStart(2, "0"),
        ].join("-")

        const result = await eventCollection
            .find({
                eventDate: { $gte: todayString },
            })
            .sort({ eventDate: 1 })
            .toArray()

        res.send(result)
    })
)



// ========================================
// GET 6 RECENT UPCOMING EVENTS
// ========================================

app.get(
    "/recent-events",
    asyncHandler(async (req, res) => {

        const today = new Date()

        today.setHours(0, 0, 0, 0)

        const todayString = [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, "0"),
            String(today.getDate()).padStart(2, "0"),
        ].join("-")

        const result = await eventCollection
            .find({
                eventDate: { $gte: todayString },
            })
            .sort({ eventDate: 1 })
            .limit(6)
            .toArray()

        res.send(result)
    })
)



// ========================================
// GET SINGLE EVENT
// ========================================

app.get(
    "/event/:id",
    asyncHandler(async (req, res) => {

        const id = getRouteParam(req, "id")

        if (!ObjectId.isValid(id)) {
            res.status(400).send({
                message: "Invalid event ID.",
            })
            return
        }

        const result = await eventCollection.findOne({
            _id: new ObjectId(id),
        })

        if (!result) {
            res.status(404).send({
                message: "Event not found.",
            })
            return
        }

        res.send(result)
    })
)


// ========================================
// JOIN EVENT
// ========================================

app.post(
    "/join-event",
    verifyToken,
    asyncHandler(async (req, res) => {

        const user = getSessionUser(res)

        if (!user) {
            res.status(401).send({
                message: "You must be logged in to join this event.",
            })
            return
        }

        const { eventId } = req.body as {
            eventId?: string
        }

        if (!eventId || !ObjectId.isValid(eventId)) {
            res.status(400).send({
                message: "Invalid event id.",
            })
            return
        }

        const event = await eventCollection.findOne({
            _id: new ObjectId(eventId),
        })

        if (!event) {
            res.status(404).send({
                message: "Event not found.",
            })
            return
        }

        const alreadyJoined = await joinedEvent.findOne({
            eventId,
            userId: user.id,
        })

        if (alreadyJoined) {
            res.status(409).send({
                message: "You have already joined this event.",
            })
            return
        }

        const result = await joinedEvent.insertOne({
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
)


// ========================================
// CHECK IF USER JOINED AN EVENT
// ========================================

app.get(
    "/event/:id/joined",
    verifyToken,
    asyncHandler(async (req, res) => {

        const user = getSessionUser(res)

        if (!user) {
            res.status(401).send({
                joined: false,
            })
            return
        }

        const id = getRouteParam(req, "id")

        if (!ObjectId.isValid(id)) {
            res.status(400).send({
                message: "Invalid event ID.",
            })
            return
        }

        const joined = await joinedEvent.findOne({
            eventId: id,
            userId: user.id,
        })

        res.send({
            joined: Boolean(joined),
        })
    })
)


// ========================================
// GET ALL JOINED EVENTS
// ========================================

app.get(
    "/joined-events",
    verifyToken,
    asyncHandler(async (req, res) => {

        const user = getSessionUser(res)

        if (!user) {
            res.status(401).send({
                message: "You must be logged in to view your joined events.",
            })
            return
        }

        const result = await joinedEvent
            .find({
                userId: user.id,
            })
            .sort({ joinedAt: -1 })
            .toArray()

        res.send(result)
    })
)


// ========================================
// GET MY CREATED EVENTS
// ========================================

app.get(
    "/my-events",
    verifyToken,
    asyncHandler(async (req, res) => {

        const user = getSessionUser(res)

        if (!user) {
            res.status(401).send({
                message: "You must be logged in to view your events.",
            })
            return
        }

        const result = await eventCollection
            .find({
                creatorEmail: user.email,
            })
            .sort({ eventDate: 1 })
            .toArray()

        res.send(result)
    })
)


// ========================================
// UPDATE EVENT
// ========================================

app.patch(
    "/update-event/:id",
    verifyToken,
    asyncHandler(async (req, res) => {

        const user = getSessionUser(res)

        if (!user) {
            res.status(401).send({
                message: "You must be logged in to update an event.",
            })
            return
        }

        const id = getRouteParam(req, "id")

        if (!ObjectId.isValid(id)) {
            res.status(400).send({
                message: "Invalid event ID.",
            })
            return
        }

        const {
            title,
            eventType,
            description,
            image,
            location,
            eventDate,
        } = req.body

        if (
            typeof title !== "string" ||
            title.trim().length < 5 ||
            title.trim().length > 100
        ) {
            res.status(400).send({
                message: "Title must be between 5 and 100 characters.",
            })
            return
        }

        if (
            typeof eventType !== "string" ||
            !eventTypes.includes(eventType)
        ) {
            res.status(400).send({
                message: "Invalid event type.",
            })
            return
        }

        if (
            typeof description !== "string" ||
            description.trim().length < 20 ||
            description.trim().length > 1000
        ) {
            res.status(400).send({
                message: "Description must be between 20 and 1000 characters.",
            })
            return
        }

        if (
            typeof location !== "string" ||
            location.trim().length < 3 ||
            location.trim().length > 150
        ) {
            res.status(400).send({
                message: "Location must be between 3 and 150 characters.",
            })
            return
        }

        if (!isValidImageUrl(image)) {
            res.status(400).send({
                message: "Please provide a valid image URL.",
            })
            return
        }

        if (!isValidEventDate(eventDate)) {
            res.status(400).send({
                message: "Event date must be tomorrow or later.",
            })
            return
        }

        const updatedData = {
            title: title.trim(),
            eventType,
            description: description.trim(),
            image: image.trim(),
            location: location.trim(),
            eventDate,
        }

        const result = await eventCollection.updateOne(
            {
                _id: new ObjectId(id),
                creatorEmail: user.email,
            },
            {
                $set: updatedData,
            }
        )

        if (result.matchedCount === 0) {
            res.status(404).send({
                message: "Event not found.",
            })
            return
        }

        res.send({
            message: "Event updated successfully.",
        })
    })
)


// ========================================
// DELETE EVENT
// ========================================

app.delete(
    "/delete-event/:id",
    verifyToken,
    asyncHandler(async (req, res) => {

        const user = getSessionUser(res)

        if (!user) {
            res.status(401).send({
                message: "You must be logged in to delete an event.",
            })
            return
        }

        const id = getRouteParam(req, "id")

        if (!ObjectId.isValid(id)) {
            res.status(400).send({
                message: "Invalid event ID.",
            })
            return
        }

        const result = await eventCollection.deleteOne({
            _id: new ObjectId(id),
            creatorEmail: user.email,
        })

        if (result.deletedCount === 0) {
            res.status(404).send({
                message: "Event not found.",
            })
            return
        }

        await joinedEvent.deleteMany({
            eventId: id,
        })

        res.send({
            message: "Event deleted successfully.",
        })
    })
)


// ========================================
// ROOT ROUTE
// ========================================

app.get("/", (req, res) => {
    res.send({
        message: "Server is running fine",
    })
})


// ========================================
// Error handler
// ========================================

app.use((
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.error("Server error:", error)

    if (res.headersSent) {
        next(error)
        return
    }

    res.status(500).send({
        message: "Internal server error.",
    })
})


// ========================================
// Local server
// ========================================

if (process.env.NODE_ENV !== "production") {
    app.listen(8000, () => {
        console.log("Server running on port 8000")
    })
}

export default app