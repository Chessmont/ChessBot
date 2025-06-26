let db;
const initDBusers = async (dbFromInit) => {
    db = dbFromInit;

    await db.query(/*sql*/`
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(32) NOT NULL PRIMARY KEY ,
            name VARCHAR(255) NOT NULL,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
};

const addUser = async (id, name) => {
    await db.query(/*sql*/`
        INSERT INTO users (id, name)
        VALUES (?, ?)
    `, [id, name]);
};

const updateName = async (id, name) => {
    await db.query(/*sql*/`
        UPDATE users
        SET name = ?
        WHERE id = ?
    `, [name, id]);
};

const userExists = async (id) => {
    const [[user]] = await db.query(/*sql*/`SELECT * FROM users WHERE id = ?`, [id]);
    return !!user;
};

const existingUsers = async () => {
  const [users] = await db.query(/*sql*/`SELECT id, name FROM users`);
  return users;
};

module.exports = {
    initDBusers,
    addUser,
    updateName,
    userExists,
    existingUsers,
};
