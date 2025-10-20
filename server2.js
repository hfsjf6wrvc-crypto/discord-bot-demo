\import express from "express";
import axios from "axios";

const app = express();

// Replace these with your own from Google Cloud Console
const CLIENT_ID = "893585941149-fsp3bt7thu8ldj72frd0rp4nc9brgcdc.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REDIRECT_URI = "http://localhost:3000/auth/google/callback"; // Same as your redirect URI

// Route to start Google login
app.get("/auth/google", (req, res) => {
  const authURL = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=code&scope=email%20profile%20https://www.googleapis.com/auth/admin.directory.group.readonly&access_type=offline`;

  res.redirect(authURL);
});

// Google sends the user back here after they log in
app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;

  try {
    // Exchange the code for an access token
    const tokenRes = await axios.post("https://oauth2.googleapis.com/token", {
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    });

    const accessToken = tokenRes.data.access_token;

    // Use the token to get user info
    const userRes = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    res.send(`
      <h2>✅ Login Successful!</h2>
      <p>Email: ${userRes.data.email}</p>
      <p>Access Token: ${accessToken}</p>
      <p>Now you can use this token to check Google Groups or link to Discord.</p>
    `);
  } catch (err) {
    console.error(err);
    res.send("❌ Error logging in");
  }
});

app.listen(3000, () => console.log("✅ Server running on http://localhost:3000"));