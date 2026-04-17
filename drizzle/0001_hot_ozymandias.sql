CREATE TABLE `announcements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`authorUserId` int NOT NULL,
	`authorName` varchar(100) NOT NULL,
	`authorEmoji` varchar(20) NOT NULL,
	`authorColor` varchar(20) NOT NULL,
	`content` text NOT NULL,
	`emoji` varchar(20),
	`announcementType` enum('news','visit','medical','daily','reminder') NOT NULL DEFAULT 'daily',
	`date` varchar(10) NOT NULL,
	`reactions` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `announcements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `briefings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`careScore` int,
	`summary` text,
	`encouragement` text,
	`highlights` json,
	`attention` text,
	`shareText` text,
	`generatedAt` varchar(30),
	`checkInDate` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `briefings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `check_ins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`authorUserId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`sleepHours` int,
	`sleepQuality` enum('poor','fair','good'),
	`sleepInput` json,
	`sleepScore` int,
	`sleepProblems` json,
	`sleepType` varchar(10),
	`sleepSegments` json,
	`awakeHours` int,
	`nightWakings` int,
	`daytimeNap` boolean,
	`napMinutes` int,
	`morningNotes` text,
	`morningDone` boolean NOT NULL DEFAULT false,
	`moodEmoji` varchar(20),
	`moodScore` int,
	`medicationTaken` boolean,
	`medicationNotes` text,
	`mealNotes` text,
	`mealOption` varchar(50),
	`eveningNotes` text,
	`eveningDone` boolean NOT NULL DEFAULT false,
	`aiMessage` text,
	`careScore` int,
	`completedAt` varchar(30),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `check_ins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `diary_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`authorUserId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`content` text NOT NULL,
	`voiceUri` text,
	`moodEmoji` varchar(20),
	`moodLabel` varchar(50),
	`moodScore` int,
	`tags` json,
	`caregiverMoodEmoji` varchar(20),
	`caregiverMoodLabel` varchar(50),
	`aiReply` text,
	`aiEmoji` varchar(20),
	`aiTip` text,
	`conversation` json,
	`conversationFinished` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `diary_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `elder_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`nickname` varchar(100) NOT NULL,
	`birthDate` varchar(10),
	`zodiacEmoji` varchar(20),
	`zodiacName` varchar(20),
	`elderPhotoUri` text,
	`elderAvatarType` varchar(10),
	`city` varchar(50),
	`reminderMorning` varchar(10),
	`reminderEvening` varchar(10),
	`careNeeds` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `elder_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `elder_profiles_roomId_unique` UNIQUE(`roomId`)
);
--> statement-breakpoint
CREATE TABLE `family_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`memberRole` enum('caregiver','family','nurse') NOT NULL DEFAULT 'family',
	`roleLabel` varchar(50) NOT NULL,
	`emoji` varchar(20) NOT NULL,
	`color` varchar(20) NOT NULL,
	`photoUri` text,
	`relationship` varchar(50),
	`isCreator` boolean NOT NULL DEFAULT false,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `family_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `family_rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomCode` varchar(10) NOT NULL,
	`elderName` varchar(100) NOT NULL,
	`elderEmoji` varchar(20),
	`elderPhotoUri` text,
	`creatorUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `family_rooms_id` PRIMARY KEY(`id`),
	CONSTRAINT `family_rooms_roomCode_unique` UNIQUE(`roomCode`)
);
--> statement-breakpoint
CREATE TABLE `medications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`dosage` varchar(100),
	`frequency` varchar(50),
	`times` json,
	`notes` text,
	`icon` varchar(20),
	`active` boolean NOT NULL DEFAULT true,
	`reminderEnabled` boolean DEFAULT true,
	`color` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `medications_id` PRIMARY KEY(`id`)
);
