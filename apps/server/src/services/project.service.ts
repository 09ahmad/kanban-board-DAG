import { prisma } from "@repo/db/client";
import type { AddMemberDto, CreateProjectDto, UpdateProjectDto } from "@repo/types";
import { ProjectRole } from "@repo/types";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from "../lib/errors.js";
import type { Project, ProjectMember, Prisma } from "@repo/db/generated/prisma/client";

export class ProjectService {
  async createProject(dto: CreateProjectDto, userId: number): Promise<Project> {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: dto.name,
          description: dto.description,
          ownerId: userId,
        },
      });
      await tx.projectMember.create({
        data: { projectId: project.id, userId, role: "OWNER" },
      });
      return project;
    });
  }

  async getProjects(userId: number): Promise<Project[]> {
    return prisma.project.findMany({
      where: { members: { some: { userId } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getProject(projectId: number, userId: number): Promise<Project & { members: ProjectMember[] }> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { members: true },
    });
    if (!project) throw new NotFoundError("Project");
    const membership = project.members.find((m) => m.userId === userId);
    if (!membership) throw new AuthorizationError();
    return project;
  }

  async updateProject(projectId: number, dto: UpdateProjectDto, userId: number): Promise<Project> {
    await this.assertOwner(projectId, userId);
    return prisma.project.update({
      where: { id: projectId },
      data: dto,
    });
  }

  async deleteProject(projectId: number, userId: number): Promise<void> {
    await this.assertOwner(projectId, userId);
    await prisma.project.delete({ where: { id: projectId } });
  }

  async addMember(projectId: number, dto: AddMemberDto, requesterId: number): Promise<ProjectMember> {
    await this.assertOwner(projectId, requesterId);
    const user = await prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundError("User");
    return prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: dto.userId } },
      update: { role: dto.role ?? "MEMBER" },
      create: {
        projectId,
        userId: dto.userId,
        role: dto.role ?? "MEMBER",
      },
    });
  }

  async removeMember(projectId: number, targetUserId: number, requesterId: number): Promise<void> {
    await this.assertOwner(projectId, requesterId);
    const owners = await prisma.projectMember.findMany({
      where: { projectId, role: ProjectRole.OWNER },
    });
    const target = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundError("Member");
    if (target.role === ProjectRole.OWNER && owners.length <= 1) {
      throw new ConflictError("Cannot remove the last owner.");
    }
    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
  }

  async requireMember(projectId: number, userId: number): Promise<ProjectMember> {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!membership) {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) throw new NotFoundError("Project");
      throw new AuthorizationError();
    }
    return membership;
  }

  private async assertOwner(projectId: number, userId: number): Promise<ProjectMember> {
    const membership = await this.requireMember(projectId, userId);
    if (membership.role !== ProjectRole.OWNER) throw new AuthorizationError();
    return membership;
  }
}

export const projectService = new ProjectService();
