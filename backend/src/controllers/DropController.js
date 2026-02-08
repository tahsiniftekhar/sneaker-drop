const { Drop, Purchase, User } = require('../models/index');

exports.createDrop = async (req, res) => {
  try {
    const { name, price, total_stock } = req.body;

    if (!name || !price || !total_stock) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const newDrop = await Drop.create({
      name,
      price,
      totalStock: total_stock,
      availableStock: total_stock,
    });

    res.status(201).json(newDrop);
  } catch (error) {
    console.error('Error creating drop:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getAllDrops = async (req, res) => {
  try {
    const drops = await Drop.findAll();

    // Fetch top 3 purchases for each drop separately to avoid Sequelize limit bug
    const dropsWithPurchases = await Promise.all(
      drops.map(async (drop) => {
        const purchases = await Purchase.findAll({
          where: { drop_id: drop.id },
          include: [{ model: User, attributes: ['id', 'username'] }],
          order: [['createdAt', 'DESC']],
          limit: 3,
        });
        return {
          ...drop.toJSON(),
          Purchases: purchases,
        };
      })
    );

    res.status(200).json(dropsWithPurchases);
  } catch (error) {
    console.log('error', error);
    res.status(500).json({ message: 'Server Error' });
  }
};
