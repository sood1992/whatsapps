/**
 * Database Seed Script
 *
 * Creates initial admin user and default automation rules
 * Run with: npm run seed
 */

import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { automationService } from '../services/automation.service';

async function main() {
  console.log('🌱 Seeding database...');

  // Create default admin
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@treatfortails.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';

  const existingAdmin = await prisma.admin.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    await prisma.admin.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: 'Admin',
        role: 'SUPER_ADMIN',
      },
    });

    console.log(`✅ Created admin user: ${adminEmail}`);
  } else {
    console.log(`ℹ️  Admin user already exists: ${adminEmail}`);
  }

  // Create default automation rules
  await automationService.createDefaultRules();
  console.log('✅ Created default automation rules');

  // Create default settings
  const defaultSettings = [
    { key: 'messaging_window_start', value: 9 },
    { key: 'messaging_window_end', value: 21 },
    { key: 'abandoned_cart_delay_minutes', value: 60 },
    { key: 'max_messages_per_day', value: 1000 },
  ];

  for (const setting of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      create: { key: setting.key, value: setting.value },
      update: {},
    });
  }
  console.log('✅ Created default settings');

  console.log('\n🎉 Database seeding completed!');
  console.log(`\n📧 Admin login: ${adminEmail}`);
  console.log(`🔑 Password: ${adminPassword}`);
  console.log('\n⚠️  Remember to change the default password!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
