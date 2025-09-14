import express from "express";
import { getWallets, createWallet, getWalletById, updateWallet, deleteWallet } from "../controllers/walletController.js";

const router = express.Router();

// Get all wallets
router.get("/", getWallets);

// Create a new wallet
router.post("/", createWallet);

// Get a wallet by ID
router.get("/:id", getWalletById);

// Update a wallet by ID
router.put("/:id", updateWallet);

// Delete a wallet by ID
router.delete("/:id", deleteWallet);

    
router.post("/pay", payForService);

export default router;