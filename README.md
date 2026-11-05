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

- Node.js
- Express.js
- MongoDB
- Better Auth
- JSON Web Token (JWT)
- TypeScript / JavaScript (depending on the server implementation)
- Vercel

## 📂 Repository

**Client (Frontend):** https://github.com/ZiaUddin76/social-event

**Server (Backend):** https://github.com/ZiaUddin76/social-event-server

## ⚙️ Environment Variables

Create a `.env` file in the root directory and configure the following variables:

```env
PORT=8000
MONGODB_URI=your_mongodb_connection_string
CLIENT_URL=your_frontend_url
BETTER_AUTH_SECRET=your_better_auth_secret
BETTER_AUTH_URL=your_better_auth_url
```

Make sure to configure all required authentication and database environment variables before running the server.

## 🚀 Run Locally

1. Clone the repository:

```bash
git clone https://github.com/ZiaUddin76/social-event-server.git
```

2. Navigate to the project directory:

```bash
cd social-event-server
```

3. Install dependencies:

```bash
npm install
```

4. Configure your environment variables in the `.env` file.

5. Start the development server:

```bash
npm run dev
```

## 🔐 Security

- Protected API routes require valid authentication.
- JWT is used for verifying authenticated requests.
- Sensitive configuration values are stored in environment variables.
- Database operations are handled securely through MongoDB.

---

**EventHub – Together, We Can Make a Difference. ❤️**