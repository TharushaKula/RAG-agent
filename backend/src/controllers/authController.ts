import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getUsersCollection, User } from "../models/User";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret_key_change_me";

export const signup = async (req: Request, res: Response) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: "Name, email, and password are required" });
        }

        const users = await getUsersCollection();
        const existingUser = await users.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ error: "User already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUser: User = {
            name,
            email,
            passwordHash,
            createdAt: new Date(),
            onboardingCompleted: false
        };

        const result = await users.insertOne(newUser);

        // Generate Token
        const token = jwt.sign({ userId: result.insertedId.toString(), email }, JWT_SECRET, { expiresIn: "7d" });

        return res.status(201).json({
            success: true,
            token,
            user: {
                id: result.insertedId,
                name,
                email,
                onboardingCompleted: false
            }
        });

    } catch (error: any) {
        console.error("Signup error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const users = await getUsersCollection();
        const user = await users.findOne({ email });

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        if (!user.passwordHash) {
            console.error(`User found but no passwordHash for email: ${email}`);
            return res.status(401).json({ error: "Invalid credentials (data integrity)" });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign({ userId: user._id?.toString(), email }, JWT_SECRET, { expiresIn: "7d" });

        return res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email,
                onboardingCompleted: user.onboardingCompleted || false,
                age: user.age,
                learningStyles: user.learningStyles || [],
                timeAvailability: user.timeAvailability || "",
                learningGoals: user.learningGoals || []
            }
        });

    } catch (error: any) {
        console.error("Login error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const updateProfile = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { age, learningStyles, timeAvailability, learningGoals } = req.body;

        const users = await getUsersCollection();
        const { ObjectId } = await import("mongodb");

        await users.updateOne(
            { _id: new ObjectId(userId) },
            {
                $set: {
                    age,
                    learningStyles,
                    timeAvailability,
                    learningGoals,
                    onboardingCompleted: true
                }
            }
        );

        return res.json({ success: true, message: "Profile updated successfully" });

    } catch (error: any) {
        console.error("Update profile error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
