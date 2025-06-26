let db;

const initDBchess = async (dbFromInit) => {
    db = dbFromInit;

    await db.query(/*sql*/`
        CREATE TABLE IF NOT EXISTS chessAccounts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            userId VARCHAR(32) NOT NULL,
            provider ENUM('chess.com', 'lichess') NOT NULL,
            accountId VARCHAR(255) NOT NULL,
            accountUrl VARCHAR(500) NOT NULL,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY unique_user_provider (userId, provider),
            UNIQUE KEY unique_provider_account (provider, accountId)
        )
    `);
};

const addChessAccount = async (userId, provider, accountId, accountUrl) => {
    await db.query(/*sql*/`
        INSERT INTO chessAccounts (userId, provider, accountId, accountUrl)
        VALUES (?, ?, ?, ?)
    `, [userId, provider, accountId, accountUrl]);
};

const updateChessAccount = async (userId, provider, accountId, accountUrl) => {
    await db.query(/*sql*/`
        UPDATE chessAccounts
        SET accountId = ?, accountUrl = ?
        WHERE userId = ? AND provider = ?
    `, [accountId, accountUrl, userId, provider]);
};

const getChessAccount = async (userId, provider) => {
    const [[account]] = await db.query(/*sql*/`
        SELECT * FROM chessAccounts
        WHERE userId = ? AND provider = ?
    `, [userId, provider]);
    return account || null;
};

const getUserChessAccounts = async (userId) => {
    const [accounts] = await db.query(/*sql*/`
        SELECT * FROM chessAccounts
        WHERE userId = ?
        ORDER BY provider
    `, [userId]);
    return accounts;
};

const removeChessAccount = async (userId, provider) => {
    const [result] = await db.query(/*sql*/`
        DELETE FROM chessAccounts
        WHERE userId = ? AND provider = ?
    `, [userId, provider]);
    return result.affectedRows > 0;
};

const chessAccountExists = async (userId, provider) => {
    const account = await getChessAccount(userId, provider);
    return !!account;
};

const getAccountByProviderAndId = async (provider, accountId) => {
    const [[account]] = await db.query(/*sql*/`
        SELECT ca.*, u.name as userName
        FROM chessAccounts ca
        JOIN users u ON ca.userId = u.id
        WHERE ca.provider = ? AND ca.accountId = ?
    `, [provider, accountId]);
    return account || null;
};

const getAllChessAccounts = async () => {
    const [accounts] = await db.query(/*sql*/`
        SELECT ca.*, u.name as userName
        FROM chessAccounts ca
        JOIN users u ON ca.userId = u.id
        ORDER BY u.name, ca.provider
    `);
    return accounts;
};

module.exports = {
    initDBchess,
    addChessAccount,
    updateChessAccount,
    getChessAccount,
    getUserChessAccounts,
    removeChessAccount,
    chessAccountExists,
    getAccountByProviderAndId,
    getAllChessAccounts
};
