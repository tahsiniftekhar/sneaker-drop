const { User, Drop } = require('./src/models/index');
const sequelize = require('./src/config/database');

async function seed() {
  try {
    await sequelize.sync({ force: true }); // WARNING: This resets the DB!

    await User.create({ username: 'sneakerhead_01' });
    await User.create({ username: 'hypebeast_99' });

    await Drop.create({
      name: 'Travis Scott x AJ1 Low',
      price: 250.00,
      totalStock: 5, // Keep it low to test "Out of Stock" scenarios
      availableStock: 5
    });

    console.log('✅ Seeding complete!');
    process.exit();
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seed();
