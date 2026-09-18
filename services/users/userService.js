'use strict';

/**
 * services/users/userService.js
 *
 * User domain service providing:
 * - User lookup and cached profile resolution.
 * - Balance, EXP, Level, and economy interaction.
 * - Ban/unban status queries.
 */

class UserService {
  constructor(database) {
    this.database = database;
  }

  get usersData() {
    return this.database?.usersData || global.db?.usersData;
  }

  async getUser(userID) {
    if (!this.usersData) return null;
    return await this.usersData.get(userID);
  }

  async getName(userID) {
    if (!this.usersData) return String(userID);
    return await this.usersData.getName(userID);
  }

  async getMoney(userID) {
    if (!this.usersData) return 0;
    const user = await this.usersData.get(userID);
    return user?.data?.money || user?.money || 0;
  }

  async addMoney(userID, amount) {
    if (!this.usersData) return false;
    return await this.usersData.addMoney(userID, amount);
  }

  async subtractMoney(userID, amount) {
    if (!this.usersData) return false;
    return await this.usersData.subtractMoney(userID, amount);
  }

  async isBanned(userID) {
    if (!this.usersData) return false;
    const user = await this.usersData.get(userID);
    return Boolean(user?.banned?.status);
  }
}

module.exports = { UserService };
