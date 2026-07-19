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
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: true,
});
