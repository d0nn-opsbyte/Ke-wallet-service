require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json()); // Parse JSON body

const port = 3000;

// Daraja credentials
const consumerKey = process.env.CONSUMER_KEY;
const consumerSecret = process.env.CONSUMER_SECRET;
const shortcode = process.env.SHORTCODE || "174379"; // sandbox
const passkey = process.env.PASSKEY; // from Daraja portal

// 1. Get access token
app.get("/access_token", async (req, res) => {
  const url =
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    res.json(response.data);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Failed to generate access token" });
  }
});

// 2. Initiate STK Push
app.post("/stk_push", async (req, res) => {
  const { phoneNumber, amount, userId } = req.body;

  // Deduct 10% commission
  const netAmount = amount * 0.9;

  try {
    // Step 1: Get access token
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const tokenResponse = await axios.get(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      { headers: { Authorization: `Basic ${auth}` } }
    );
    const accessToken = tokenResponse.data.access_token;

    // Step 2: Prepare STK push payload
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const password = Buffer.from(shortcode + passkey + timestamp).toString("base64");

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phoneNumber,
      PartyB: shortcode,
      PhoneNumber: phoneNumber,
      CallBackURL: "https://yourdomain.com/api/mpesa/callback", // Update with your ngrok/live URL
      AccountReference: `USER-${userId}`,
      TransactionDesc: "Wallet Top-up",
    };

    const stkURL =
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

    const stkResponse = await axios.post(stkURL, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    res.json({
      message: "STK Push initiated. Check your phone.",
      netAmount: netAmount,
      rawResponse: stkResponse.data,
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "STK Push failed" });
  }
});

// 3. Callback Route from Safaricom
app.post("/api/mpesa/callback", async (req, res) => {
  console.log("📩 M-Pesa Callback Received:", JSON.stringify(req.body, null, 2));

  const callback = req.body.Body.stkCallback;
  if (!callback) {
    return res.status(400).json({ error: "Invalid callback data" });
  }

  if (callback.ResultCode === 0) {
    // ✅ Payment successful
    const amount = callback.CallbackMetadata.Item.find(i => i.Name === "Amount")
      .Value;
    const phone = callback.CallbackMetadata.Item.find(i => i.Name === "PhoneNumber")
      .Value;

    // Deduct 10% commission
    const netAmount = amount * 0.9;

    console.log(`💰 Payment Success: ${amount} from ${phone}, Net: ${netAmount}`);

    // TODO: Update user wallet in your DB (json-server, PostgreSQL, etc.)
    // Example (pseudo-code):
    // await db.wallets.update({ userId }, { balance: balance + netAmount });

    return res.json({ message: "Wallet updated", netAmount });
  } else {
    console.log("❌ Payment Failed:", callback.ResultDesc);
    return res.json({ message: "Payment failed", details: callback.ResultDesc });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});