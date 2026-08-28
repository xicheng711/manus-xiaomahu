import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _migrationDone = false;
let _migrationPromise: Promise<void> | null = null;

// Run lightweight schema migrations on first connect (idempotent ALTER TABLE IF NOT EXISTS)
async function runAutoMigrations(db: ReturnType<typeof drizzle>) {
  if (_migrationDone) return;
  _migrationDone = true;

  // MySQL 8.0 does NOT support ADD COLUMN IF NOT EXISTS.
  // We check information_schema first, then add only if missing.
  const columnsToAdd: Array<{ table: string; column: string; definition: string }> = [
    { table: 'announcements',  column: 'localTimeStr', definition: 'varchar(10)' },
    { table: 'diary_entries',  column: 'localTimeStr', definition: 'varchar(10)' },
    { table: 'family_members', column: 'birthYear',    definition: 'int' },
  ];

  for (const { table, column, definition } of columnsToAdd) {
    try {
      const rows: any[] = await (db as any).execute(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME   = '${table}'
           AND COLUMN_NAME  = '${column}'
         LIMIT 1`
      );
      // drizzle returns [rows, fields]; rows is the first element
      const exists = Array.isArray(rows[0]) ? rows[0].length > 0 : rows.length > 0;
      if (!exists) {
        await (db as any).execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        console.log(`[Database] Migration: added ${table}.${column}`);
      }
    } catch (e: any) {
      console.warn(`[Database] Migration warning (${table}.${column}):`, e?.message ?? e);
    }
  }

  // 日记互动表：CREATE TABLE IF NOT EXISTS 在 MySQL 8.0 可安全重复执行。
  const tablesToCreate = [
    `CREATE TABLE IF NOT EXISTS diary_reads (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      roomId INT NOT NULL,
      diaryId INT NOT NULL,
      readerUserId INT NOT NULL,
      readerName VARCHAR(100) NOT NULL,
      readerEmoji VARCHAR(20) NOT NULL,
      readAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_diary_reader (diaryId, readerUserId),
      KEY idx_diary_reads_room_diary (roomId, diaryId)
    )`,
    `CREATE TABLE IF NOT EXISTS diary_comments (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      roomId INT NOT NULL,
      diaryId INT NOT NULL,
      authorUserId INT NOT NULL,
      authorName VARCHAR(100) NOT NULL,
      authorEmoji VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_diary_comments_room_diary (roomId, diaryId),
      KEY idx_diary_comments_created (createdAt)
    )`,
    `CREATE TABLE IF NOT EXISTS medication_changes (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      roomId INT NOT NULL,
      medicationId INT NULL,
      eventId VARCHAR(100) NOT NULL,
      changedByUserId INT NOT NULL,
      changedByName VARCHAR(100) NOT NULL,
      changeType VARCHAR(30) NOT NULL,
      reason TEXT NULL,
      previousSnapshot JSON NULL,
      nextSnapshot JSON NULL,
      changedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_medication_change_event (eventId),
      KEY idx_medication_changes_room_time (roomId, changedAt),
      KEY idx_medication_changes_medication (roomId, medicationId)
    )`,
  ];
  for (const statement of tablesToCreate) {
    try {
      await (db as any).execute(statement);
    } catch (e: any) {
      console.warn('[Database] Migration warning (family feature tables):', e?.message ?? e);
    }
  }
  console.log('[Database] Auto-migrations complete');
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
      // 首次连接时等待轻量迁移完成，避免紧接着查询新表时出现 table not found。
      _migrationPromise = runAutoMigrations(_db).catch(e => {
        console.warn('[Database] Auto-migration failed:', e);
      });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  if (_migrationPromise) await _migrationPromise;
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function deleteUserByOpenId(openId: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn('[Database] Cannot delete user: database not available');
    return;
  }
  try {
    await db.delete(users).where(eq(users.openId, openId));
    console.log('[Database] User deleted:', openId);
  } catch (error) {
    console.error('[Database] Failed to delete user:', error);
    throw error;
  }
}


/** Save or update the Expo push token for a user */
export async function updatePushToken(userId: number, pushToken: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.update(users).set({ pushToken }).where(eq(users.id, userId));
  } catch (error) {
    console.error('[Database] Failed to update pushToken:', error);
  }
}

/** Get users by a list of IDs (for sending push notifications) */
export async function getUsersByIds(ids: number[]): Promise<typeof users.$inferSelect[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const result = [];
  for (const id of ids) {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (rows[0]) result.push(rows[0]);
  }
  return result;
}
// TODO: add feature queries here as your schema grows.
