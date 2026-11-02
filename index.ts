import express from 'express'
import { MongoClient } from 'mongodb';
import 'dotenv/config'
import cors from "cors"


const app = express()
const PORT = 8000


app.use(cors())
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





app.get('/', (req, res) => {
  res.send({message: 'Server is running fine'})
})

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`)
})