CREATE TABLE "job_titles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "job_titles_name_unique" UNIQUE("name")
);
