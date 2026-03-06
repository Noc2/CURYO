import * as schema from "./schema";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { getDatabaseConfig } from "~~/lib/env/server";

const client = createClient(getDatabaseConfig());

export const db = drizzle(client, { schema });
export const dbClient = client;
