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
  SignalFlagCatalogEntity,
  CheckpointPass,
  WebhookSubscription,
  AuditLog,
  Trophy,
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
    SignalFlagCatalogEntity,
    CheckpointPass,
    WebhookSubscription,
    AuditLog,
    Trophy,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: true,
});
