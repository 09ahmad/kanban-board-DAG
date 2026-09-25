import WebSocket from "ws";

export class ConnectionManager {
  private clients = new Map<WebSocket, Set<number>>();

  subscribe(ws: WebSocket, projectId: number): void {
    let projects = this.clients.get(ws);
    if (!projects) {
      projects = new Set();
      this.clients.set(ws, projects);
    }
    projects.add(projectId);
  }

  unsubscribe(ws: WebSocket, projectId: number): void {
    const projects = this.clients.get(ws);
    if (projects) {
      projects.delete(projectId);
      if (projects.size === 0) {
        this.clients.delete(ws);
      }
    }
  }

  remove(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  broadcast(projectId: number, message: string): void {
    for (const [ws, projects] of this.clients.entries()) {
      if (projects.has(projectId) && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }
}

export const connectionManager = new ConnectionManager();