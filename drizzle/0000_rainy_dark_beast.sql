CREATE TABLE `grocery_items` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`required_quantity` real NOT NULL,
	`unit` text NOT NULL,
	`purchased_quantity` real,
	`checked` integer DEFAULT false NOT NULL,
	`reason_json` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `grocery_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `grocery_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`store` text NOT NULL,
	`window_start` text NOT NULL,
	`window_end` text NOT NULL,
	`cadence` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`base_unit` text NOT NULL,
	`preferred_store` text,
	`costco_eligible` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingredients_name_unique` ON `ingredients` (`name`);--> statement-breakpoint
CREATE TABLE `inventory_lots` (
	`id` text PRIMARY KEY NOT NULL,
	`ingredient_id` text NOT NULL,
	`estimated_quantity` real NOT NULL,
	`unit` text NOT NULL,
	`confidence` real NOT NULL,
	`purchased_at` integer,
	`expires_at` integer,
	`last_confirmed_at` integer,
	`source` text NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inventory_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`ingredient_id` text NOT NULL,
	`kind` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`confidence_delta` real DEFAULT 0 NOT NULL,
	`related_id` text,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `meal_plan_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`recipe_id` text,
	`meal_type` text DEFAULT 'dinner' NOT NULL,
	`servings` real NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`rationale_json` text,
	`completed_at` integer,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`timezone` text DEFAULT 'America/Denver' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile_ingredients` (
	`profile_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	PRIMARY KEY(`profile_id`, `ingredient_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `recurring_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`recipe_id` text NOT NULL,
	`ingredient_id` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`preparation` text,
	`optional` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`recipe_id`, `ingredient_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`cuisine` text,
	`method` text,
	`servings` integer DEFAULT 2 NOT NULL,
	`instructions_json` text NOT NULL,
	`prep_minutes` integer,
	`cook_minutes` integer,
	`starred` integer DEFAULT false NOT NULL,
	`rating` integer,
	`notes` text,
	`last_cooked_at` integer
);
--> statement-breakpoint
CREATE TABLE `recurring_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`name` text NOT NULL,
	`meal_type` text NOT NULL,
	`applies_when` text NOT NULL,
	`days_of_week_json` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `schedule_events` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`kind` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`title` text NOT NULL,
	`location` text,
	`source` text DEFAULT 'manual' NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
