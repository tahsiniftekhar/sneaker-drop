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
      total_stock,
      available_stock: total_stock,
    });

    res.status(201).json(newDrop);
  } catch (error) {
    console.error('Error creating drop:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getAllDrops = async (req, res) => {
  try {
    const drops = await Drop.findAll({
      include: [
        {
          model: Purchase,
          limit: 3,
          order: [['created_at', 'DESC']],
          include: [
            {
              model: User,
              attributes: ['username'],
            },
          ],
        },
      ],
    });
    res.status(200).json(drops);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};
