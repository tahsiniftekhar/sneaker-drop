const User = require('./User');
const Drop = require('./Drop');
const Reservation = require('./Reservation');
const Purchase = require('./Purchase');

// Users <-> Reservations
User.hasMany(Reservation, { foreignKey: 'user_id' });
Reservation.belongsTo(User, { foreignKey: 'user_id' });

// Drops <-> Reservations
Drop.hasMany(Reservation, { foreignKey: 'drop_id' });
Reservation.belongsTo(Drop, { foreignKey: 'drop_id' });

// Users <-> Purchases
User.hasMany(Purchase, { foreignKey: 'user_id' });
Purchase.belongsTo(User, { foreignKey: 'user_id' });

// Drops <-> Purchases
Drop.hasMany(Purchase, { foreignKey: 'drop_id' });
Purchase.belongsTo(Drop, { foreignKey: 'drop_id' });

module.exports = { User, Drop, Reservation, Purchase };
