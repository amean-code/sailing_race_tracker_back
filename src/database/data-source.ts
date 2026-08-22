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
  TrophyGroup,
  Leg,
  RaceResult,
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
    TrophyGroup,
    Leg,
    RaceResult,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: true,
});
