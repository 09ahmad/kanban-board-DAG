// Database seed data for TaskFlow Pro
import { PrismaClient } from '@repo/db/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting database seeding...')

  // Clear existing data
  await prisma.taskEvent.deleteMany()
  await prisma.aiSuggestion.deleteMany()
  await prisma.taskDependency.deleteMany()
  await prisma.task.deleteMany()
  await prisma.projectMember.deleteMany()
  await prisma.project.deleteMany()
  await prisma.user.deleteMany()

  // Create users
  const alice = await prisma.user.create({
    data: {
      name: 'Alice Johnson',
      email: 'alice@example.com',
      passwordHash: await Bun.password.hash('alice123', { algorithm: 'bcrypt', cost: 12 }),
      avatarUrl: 'https://i.pravatar.cc/150?img=1'
    }
  })

  const bob = await prisma.user.create({
    data: {
      name: 'Bob Smith',
      email: 'bob@example.com',
      passwordHash: await Bun.password.hash('bob123', { algorithm: 'bcrypt', cost: 12 }),
      avatarUrl: 'https://i.pravatar.cc/150?img=2'
    }
  })

  const charlie = await prisma.user.create({
    data: {
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      passwordHash: await Bun.password.hash('charlie123', { algorithm: 'bcrypt', cost: 12 }),
      avatarUrl: 'https://i.pravatar.cc/150?img=3'
    }
  })

  // Create projects
  const project1 = await prisma.project.create({
    data: {
      name: 'Website Redesign',
      description: 'Redesign company website with modern UI/UX',
      ownerId: alice.id,
    }
  })

  const project2 = await prisma.project.create({
    data: {
      name: 'Mobile App Development',
      description: 'Build cross-platform mobile app for iOS and Android',
      ownerId: bob.id,
    }
  })

  // Create project memberships
  await prisma.projectMember.createMany({
    data: [
      { projectId: project1.id, userId: alice.id, role: 'OWNER' },
      { projectId: project1.id, userId: bob.id, role: 'MEMBER' },
      { projectId: project1.id, userId: charlie.id, role: 'MEMBER' },
      { projectId: project2.id, userId: bob.id, role: 'OWNER' },
      { projectId: project2.id, userId: alice.id, role: 'MEMBER' },
    ]
  })

  // Create sample tasks for project1 (Website Redesign)
  const tasks = [
    await prisma.task.create({
      data: {
        projectId: project1.id,
        title: 'Research & Planning',
        description: 'Gather requirements and create project plan',
        status: 'DONE',
        readiness: 'READY',
        position: 0,
        plannedStart: new Date('2026-09-01'),
        duration: 3,
        computedStart: new Date('2026-09-01'),
        computedEnd: new Date('2026-09-04'),
      }
    }),
    await prisma.task.create({
      data: {
        projectId: project1.id,
        title: 'UI/UX Design',
        description: 'Create wireframes and mockups for all pages',
        status: 'IN_PROGRESS',
        readiness: 'READY',
        position: 1,
        plannedStart: new Date('2026-09-05'),
        duration: 5,
        computedStart: new Date('2026-09-05'),
        computedEnd: new Date('2026-09-10'),
      }
    }),
    await prisma.task.create({
      data: {
        projectId: project1.id,
        title: 'Frontend Development',
        description: 'Implement React components and styling',
        status: 'BACKLOG',
        readiness: 'BLOCKED',
        position: 2,
        plannedStart: new Date('2026-09-11'),
        duration: 8,
        computedStart: undefined,
        computedEnd: undefined,
      }
    }),
    await prisma.task.create({
      data: {
        projectId: project1.id,
        title: 'Backend Development',
        description: 'Build API endpoints and database schema',
        status: 'BACKLOG',
        readiness: 'BLOCKED',
        position: 3,
        plannedStart: new Date('2026-09-11'),
        duration: 7,
        computedStart: undefined,
        computedEnd: undefined,
      }
    }),
    await prisma.task.create({
      data: {
        projectId: project1.id,
        title: 'Testing & QA',
        description: 'Perform functional and usability testing',
        status: 'BACKLOG',
        readiness: 'BLOCKED',
        position: 4,
        plannedStart: new Date('2026-09-19'),
        duration: 4,
        computedStart: undefined,
        computedEnd: undefined,
      }
    }),
    await prisma.task.create({
      data: {
        projectId: project1.id,
        title: 'Deployment & Launch',
        description: 'Deploy to production and monitor',
        status: 'BACKLOG',
        readiness: 'BLOCKED',
        position: 5,
        plannedStart: new Date('2026-09-23'),
        duration: 2,
        computedStart: undefined,
        computedEnd: undefined,
      }
    }),
  ]

  // Create task dependencies for project1
  await prisma.taskDependency.createMany({
    data: [
      { prerequisiteTaskId: tasks[0].id, dependentTaskId: tasks[1].id }, // Research → Design
      { prerequisiteTaskId: tasks[1].id, dependentTaskId: tasks[2].id }, // Design → Frontend
      { prerequisiteTaskId: tasks[1].id, dependentTaskId: tasks[3].id }, // Design → Backend
      { prerequisiteTaskId: tasks[2].id, dependentTaskId: tasks[4].id }, // Frontend → Testing
      { prerequisiteTaskId: tasks[3].id, dependentTaskId: tasks[4].id }, // Backend → Testing
      { prerequisiteTaskId: tasks[4].id, dependentTaskId: tasks[5].id }, // Testing → Deployment
    ]
  })

  // Create sample tasks for project2 (Mobile App)
  const mobileTasks = [
    await prisma.task.create({
      data: {
        projectId: project2.id,
        title: 'Requirement Analysis',
        description: 'Define app features and user stories',
        status: 'DONE',
        readiness: 'READY',
        position: 0,
        plannedStart: new Date('2026-09-01'),
        duration: 2,
        computedStart: new Date('2026-09-01'),
        computedEnd: new Date('2026-09-03'),
      }
    }),
    await prisma.task.create({
      data: {
        projectId: project2.id,
        title: 'App Architecture',
        description: 'Design app structure and technology stack',
        status: 'DONE',
        readiness: 'READY',
        position: 1,
        plannedStart: new Date('2026-09-03'),
        duration: 3,
        computedStart: new Date('2026-09-03'),
        computedEnd: new Date('2026-09-06'),
      }
    }),
    await prisma.task.create({
      data: {
        projectId: project2.id,
        title: 'UI Design',
        description: 'Create app screens and navigation flow',
        status: 'IN_PROGRESS',
        readiness: 'READY',
        position: 2,
        plannedStart: new Date('2026-09-07'),
        duration: 4,
        computedStart: new Date('2026-09-07'),
        computedEnd: new Date('2026-09-11'),
      }
    }),
    await prisma.task.create({
      data: {
        projectId: project2.id,
        title: 'iOS Development',
        description: 'Develop iOS app using Swift',
        status: 'BACKLOG',
        readiness: 'BLOCKED',
        position: 3,
        plannedStart: new Date('2026-09-11'),
        duration: 6,
        computedStart: undefined,
        computedEnd: undefined,
      }
    }),
    await prisma.task.create({
      data: {
        projectId: project2.id,
        title: 'Android Development',
        description: 'Develop Android app using Kotlin',
        status: 'BACKLOG',
        readiness: 'BLOCKED',
        position: 4,
        plannedStart: new Date('2026-09-11'),
        duration: 6,
        computedStart: undefined,
        computedEnd: undefined,
      }
    }),
    await prisma.task.create({
      data: {
        projectId: project2.id,
        title: 'App Testing',
        description: 'Test on multiple devices and platforms',
        status: 'BACKLOG',
        readiness: 'BLOCKED',
        position: 5,
        plannedStart: new Date('2026-09-17'),
        duration: 5,
        computedStart: undefined,
        computedEnd: undefined,
      }
    }),
    await prisma.task.create({
      data: {
        projectId: project2.id,
        title: 'App Store Submission',
        description: 'Prepare and submit to App Store and Play Store',
        status: 'BACKLOG',
        readiness: 'BLOCKED',
        position: 6,
        plannedStart: new Date('2026-09-22'),
        duration: 3,
        computedStart: undefined,
        computedEnd: undefined,
      }
    }),
  ]

  // Create task dependencies for project2
  await prisma.taskDependency.createMany({
    data: [
      { prerequisiteTaskId: mobileTasks[0].id, dependentTaskId: mobileTasks[1].id }, // Requirement → Architecture
      { prerequisiteTaskId: mobileTasks[1].id, dependentTaskId: mobileTasks[2].id }, // Architecture → UI Design
      { prerequisiteTaskId: mobileTasks[2].id, dependentTaskId: mobileTasks[3].id }, // UI Design → iOS Dev
      { prerequisiteTaskId: mobileTasks[2].id, dependentTaskId: mobileTasks[4].id }, // UI Design → Android Dev
      { prerequisiteTaskId: mobileTasks[3].id, dependentTaskId: mobileTasks[5].id }, // iOS Dev → Testing
      { prerequisiteTaskId: mobileTasks[4].id, dependentTaskId: mobileTasks[5].id }, // Android Dev → Testing
      { prerequisiteTaskId: mobileTasks[5].id, dependentTaskId: mobileTasks[6].id }, // Testing → Submission
    ]
  })

  // Create some AI suggestions
  await prisma.aiSuggestion.createMany({
    data: [
      {
        projectId: project1.id,
        taskId: tasks[2].id, // Frontend Development
        prerequisiteTaskId: tasks[0].id, // Research & Planning
        confidence: 0.95,
        reason: 'Frontend work should build on completed research',
        status: 'PENDING',
      },
      {
        projectId: project1.id,
        taskId: tasks[3].id, // Backend Development
        prerequisiteTaskId: tasks[1].id, // UI/UX Design
        confidence: 0.85,
        reason: 'Backend API should match UI design specifications',
        status: 'PENDING',
      }
    ]
  })

  console.log('Database seeding completed!')
  console.log(`Created: ${await prisma.user.count()} users`)
  console.log(`Created: ${await prisma.project.count()} projects`)
  console.log(`Created: ${await prisma.task.count()} tasks`)
  console.log(`Created: ${await prisma.taskDependency.count()} dependencies`)
  console.log(`Created: ${await prisma.aiSuggestion.count()} AI suggestions`)
}

main()
  .catch((e) => {
    console.error('Seeding error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })