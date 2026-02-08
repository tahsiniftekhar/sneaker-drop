const { User } = require('../models/index');

exports.getAllUsers = async (req, res) => {
  try {
    const allUsers = await User.findAll({
      attributes: ['id', 'username', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: allUsers.length,
      data: allUsers
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve users'
    });
  }
};
