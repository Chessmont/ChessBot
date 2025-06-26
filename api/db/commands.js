let db;

const initDBcommands = async (dbFromInit, client) => {
    db = dbFromInit;

    if(!client) {
        await db.query(/*sql*/`DROP TABLE IF EXISTS commands`);

        await db.query(/*sql*/`
            CREATE TABLE IF NOT EXISTS commands (
                id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(50) NOT NULL,
                info TEXT NOT NULL,
                description TEXT NOT NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
    }
};

const addCommand = async (commandInfo) => {
    const [command] = await db.query(/*sql*/`SELECT * FROM commands WHERE name = ?`, [commandInfo.commandName]);
    if (!command.length) {
        await db.query(/*sql*/`
            INSERT INTO commands (name, info, description)
            VALUES (?, ?, ?)
        `, [commandInfo.commandName, commandInfo.commandInfo, commandInfo.commandDescription]);
    } else {
        await db.query(/*sql*/`
            UPDATE commands
            SET info = ?, description = ?
            WHERE name = ?
        `, [commandInfo.commandInfo, commandInfo.commandDescription, commandInfo.commandName]);
    }
};

const getCommands = async () => {
    const [commands] = await db.query(/*sql*/`SELECT * FROM commands`);
    return commands;
};

const getCommand = async (commandName) => {
    const [[command]] = await db.query(/*sql*/`SELECT * FROM commands WHERE name = ?`, [commandName]);
    return command;
};

module.exports = {
    initDBcommands,
    addCommand,
    getCommands,
    getCommand,
};
