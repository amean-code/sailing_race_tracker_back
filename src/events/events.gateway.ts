import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    // console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    // console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinRace')
  handleJoinRace(
    @MessageBody() data: { raceId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data && data.raceId) {
      client.join(data.raceId);
    }
  }

  @SubscribeMessage('leaveRace')
  handleLeaveRace(
    @MessageBody() data: { raceId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data && data.raceId) {
      client.leave(data.raceId);
    }
  }

  // --- Event Emitter Listeners ---

  @OnEvent('race.updated')
  handleRaceUpdated(payload: any) {
    if (payload.raceId) {
      this.server.to(payload.raceId).emit('race.updated', payload);
    }
  }

  @OnEvent('boat.position.updated')
  handleBoatPositionUpdated(payload: any) {
    if (payload.raceId) {
      this.server.to(payload.raceId).emit('boat.position.updated', payload);
    }
  }

  @OnEvent('checkpoint.passed')
  handleCheckpointPassed(payload: any) {
    if (payload.raceId) {
      this.server.to(payload.raceId).emit('checkpoint.passed', payload);
    }
  }

  @OnEvent('leaderboard.updated')
  handleLeaderboardUpdated(payload: any) {
    if (payload.raceId) {
      this.server.to(payload.raceId).emit('leaderboard.updated', payload);
    }
  }

  @OnEvent('boat.finished')
  handleBoatFinished(payload: any) {
    if (payload.raceId) {
      this.server.to(payload.raceId).emit('boat.finished', payload);
    }
  }

  @OnEvent('race.finished')
  handleRaceFinished(payload: any) {
    if (payload.raceId) {
      this.server.to(payload.raceId).emit('race.finished', payload);
    }
  }

  @SubscribeMessage('joinTelemetry')
  handleJoinTelemetry(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    // Basic protection can be added here or via middleware. 
    // Assuming clients emitting joinTelemetry are verified SUPER_ADMINs.
    client.join('telemetry');
  }

  @SubscribeMessage('leaveTelemetry')
  handleLeaveTelemetry(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    client.leave('telemetry');
  }

  // --- Telemetry Methods ---

  getActiveConnectionsCount(): number {
    if (!this.server) return 0;
    return this.server.engine.clientsCount;
  }

  getRoomCount(): number {
    if (!this.server) return 0;
    return this.server.sockets.adapter.rooms.size;
  }

  broadcastTelemetry(stats: any) {
    if (!this.server) return;
    this.server.to('telemetry').emit('telemetry.stats', stats);
  }
}
