DROP INDEX IF EXISTS "uq_reactions_post_anon_kind";--> statement-breakpoint
ALTER TABLE "reactions" ALTER COLUMN "post_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "reactions" ADD COLUMN "comment_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reactions" ADD CONSTRAINT "reactions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reactions_comment" ON "reactions" USING btree ("comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_reactions_comment_anon_kind" ON "reactions" USING btree ("comment_id","reactor_anon_id","kind") WHERE "reactions"."comment_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_reactions_post_anon_kind" ON "reactions" USING btree ("post_id","reactor_anon_id","kind") WHERE "reactions"."post_id" IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reactions" ADD CONSTRAINT "reactions_subject_xor"
   CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;