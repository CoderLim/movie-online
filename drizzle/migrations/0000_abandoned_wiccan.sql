CREATE TABLE `movie_platforms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` integer NOT NULL,
	`platform` text NOT NULL,
	`status` text DEFAULT 'not_available' NOT NULL,
	`play_url` text,
	`available_at` text,
	`last_checked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movie_platforms_movie_id_platform_unique` ON `movie_platforms` (`movie_id`,`platform`);--> statement-breakpoint
CREATE TABLE `movies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`maoyan_id` text NOT NULL,
	`douban_id` text,
	`poster_url` text,
	`rating` real,
	`description` text,
	`release_date` text,
	`theater_end_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movies_maoyan_id_unique` ON `movies` (`maoyan_id`);--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` integer NOT NULL,
	`user_token` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watchlist_user_token_movie_id_unique` ON `watchlist` (`user_token`,`movie_id`);