CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`name` text NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`combo` integer DEFAULT 0 NOT NULL,
	`best_combo` integer DEFAULT 0 NOT NULL,
	`current_round` integer DEFAULT 0 NOT NULL,
	`pressed` text DEFAULT '[]' NOT NULL,
	`mistakes` integer DEFAULT 0 NOT NULL,
	`perfects` integer DEFAULT 0 NOT NULL,
	`joined_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host_id` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`duration` integer DEFAULT 60 NOT NULL,
	`targets` integer DEFAULT 4 NOT NULL,
	`seed` integer NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`ends_at` integer
);
