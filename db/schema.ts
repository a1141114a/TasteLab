import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const submissions=sqliteTable('submissions',{
id:text('id').primaryKey(),guestKey:text('guest_key').notNull(),nickname:text('nickname').notNull(),
name:text('name').notNull(),koreanName:text('korean_name').notNull().default(''),address:text('address').notNull(),
area:text('area').notNull(),categories:text('categories').notNull(),recommendation:text('recommendation').notNull(),
spend:integer('spend'),status:text('status').notNull().default('pending'),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
});
export const photos=sqliteTable('photos',{id:text('id').primaryKey(),submissionId:text('submission_id').notNull().references(()=>submissions.id),objectKey:text('object_key').notNull(),mime:text('mime').notNull(),size:integer('size').notNull(),createdAt:integer('created_at').notNull()});
export const limits=sqliteTable('request_limits',{key:text('key').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull()});
export const moderation=sqliteTable('moderation_log',{id:text('id').primaryKey(),submissionId:text('submission_id').notNull().references(()=>submissions.id),actor:text('actor').notNull(),action:text('action').notNull(),createdAt:integer('created_at').notNull()});
