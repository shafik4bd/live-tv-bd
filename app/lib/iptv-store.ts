import fs from "fs";
import path from "path";
import crypto from "crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { IPTVConfig } from "./iptv-types";

const configPath = path.join(process.cwd(), "app", "data", "admin-config.json");

export const defaultConfig: IPTVConfig = {
  segments: [],
  playlists: [],
  popup: {
    enabled: false,
    title: "Live event announcement",
    body: "Add a custom popup message from the admin panel.",
    image: "",
    cta: "Start watching",
  },
  updatedAt: new Date(0).toISOString(),
};

function normalizeConfig(config: Partial<IPTVConfig> | null | undefined): IPTVConfig {
  return {
    ...defaultConfig,
    ...config,
    popup: { ...defaultConfig.popup, ...config?.popup },
    segments: Array.isArray(config?.segments) ? config.segments : [],
    playlists: Array.isArray(config?.playlists) ? config.playlists : [],
    updatedAt: config?.updatedAt || defaultConfig.updatedAt,
  };
}

function hasFirebaseAdminConfig() {
  return Boolean(
    process.env.FIREBASE_DATABASE_URL &&
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );
}

function getFirebaseDatabase() {
  if (!hasFirebaseAdminConfig()) return null;

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!privateKey) return null;

  const app =
    getApps()[0] ||
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });

  return getDatabase(app);
}

function readLocalConfig(): IPTVConfig {
  try {
    if (!fs.existsSync(configPath)) return defaultConfig;
    return normalizeConfig(JSON.parse(fs.readFileSync(configPath, "utf8")));
  } catch (error) {
    console.error("Failed to read local IPTV config:", error);
    return defaultConfig;
  }
}

function writeLocalConfig(config: IPTVConfig) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

export async function readIPTVConfig(): Promise<IPTVConfig> {
  const db = getFirebaseDatabase();
  if (!db) return readLocalConfig();

  try {
    const snapshot = await db.ref("iptvConfig").get();
    return normalizeConfig(snapshot.val());
  } catch (error) {
    console.error("Failed to read Firebase IPTV config, falling back to local file:", error);
    return readLocalConfig();
  }
}

export async function writeIPTVConfig(config: IPTVConfig) {
  const nextConfig = normalizeConfig({
    ...config,
    updatedAt: new Date().toISOString(),
  });

  const db = getFirebaseDatabase();
  if (db) {
    await db.ref("iptvConfig").set(nextConfig);
    return nextConfig;
  }

  writeLocalConfig(nextConfig);
  return nextConfig;
}

export function getConfigHash(config: IPTVConfig) {
  return crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

export function verifyAdminPin(pin: unknown) {
  const expected = process.env.ADMIN_PIN || "admin123";
  return typeof pin === "string" && pin === expected;
}
