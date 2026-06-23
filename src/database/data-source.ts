import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import {
  User,
  Course,
  Boat,
  TrackPoint,
  Race,
  RaceApplication,
  NotificationIntegration,
  NotificationRule,
  NotificationLog,
} from '../entities';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    User,
    Course,
    Boat,
    TrackPoint,
    Race,
    RaceApplication,
    NotificationIntegration,
    NotificationRule,
    NotificationLog,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
