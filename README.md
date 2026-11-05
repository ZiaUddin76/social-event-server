# EventHub – Backend Server

EventHub is a community-driven event management platform that connects people through volunteering, social activities, and community development initiatives.

This repository contains the backend server of EventHub, responsible for managing event data, user authentication, event participation, and database operations.

## 🌐 Live Server

**Backend URL:** https://social-event-server-eta.vercel.app

**Frontend Website:** https://social-event-eta.vercel.app

## ✨ Key Features

- **Event Management:** Provides APIs to create, retrieve, update, and delete community events.
- **Upcoming Events:** Retrieves upcoming events while excluding past events.
- **Event Details:** Provides detailed information about individual events.
- **User Authentication:** Integrates Better Auth for secure user authentication.
- **JWT Authorization:** Uses JSON Web Tokens to verify authenticated requests and protect private API routes.
- **Join Events:** Allows authenticated users to join community events.
- **Manage Events:** Supports retrieving and managing events created by individual users.
- **Joined Events:** Retrieves events that users have joined.
- **MongoDB Integration:** Stores and manages event and booking data using MongoDB.

## 🛠️ Technologies Used

- **Node.js** – JavaScript runtime environment.
- **TypeScript** – Type-safe development.
- **Express.js 5** – Backend web framework.
- **MongoDB 7** – Database.
- **Better Auth** – Authentication and session management.
- **JOSE** – JWT-related operations.
- **CORS** – Cross-origin resource sharing.
- **Dotenv** – Environment variable management.
- **tsx** – TypeScript execution.
- **Nodemon** – Automatic server restart during development.
- **Vercel** – Deployment platform.

## 📂 Repositories

- **Client (Frontend):** https://github.com/ZiaUddin76/social-event
- **Server (Backend):** https://github.com/ZiaUddin76/social-event-server

## ⚙️ Environment Variables

Create a `.env` file in the root directory and configure the required environment variables.

```env
PORT=8000
MONGODB_URI=your_mongodb_connection_string
CLIENT_URL=your_frontend_url
BETTER_AUTH_SECRET=your_better_auth_secret
BETTER_AUTH_URL=your_better_auth_url
```

Configure all required environment variables according to your server implementation. Never commit your actual secrets to GitHub.

## 🚀 Run Locally

**1. Clone the repository**

```bash
git clone https://github.com/ZiaUddin76/social-event-server.git
```

**2. Navigate to the project directory**

```bash
cd social-event-server
```

**3. Install dependencies**

```bash
npm install
```

**4. Configure environment variables**

Create a `.env` file and add your required configuration.

**5. Start the development server**

```bash
npm run dev
```

## 🔐 Security

- Protected API routes require valid authentication.
- JWT is used for verifying authenticated requests.
- Sensitive configuration values are stored in environment variables.
- Database operations are handled through MongoDB.

---

**EventHub – Together, We Can Make a Difference. ❤️**