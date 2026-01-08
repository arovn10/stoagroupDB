import sql from 'mssql';

/**
 * Build a SELECT query with optional WHERE clause
 */
export const buildSelectQuery = (
  tableName: string,
  whereClause?: string,
  orderBy?: string
): string => {
  let query = `SELECT * FROM ${tableName}`;
  if (whereClause) {
    query += ` WHERE ${whereClause}`;
  }
  if (orderBy) {
    query += ` ORDER BY ${orderBy}`;
  }
  return query;
};

/**
 * Build an INSERT query
 */
export const buildInsertQuery = (
  tableName: string,
  columns: string[],
  outputColumn?: string
): string => {
  const columnsStr = columns.join(', ');
  const valuesStr = columns.map((col) => `@${col}`).join(', ');
  
  let query = `INSERT INTO ${tableName} (${columnsStr}) OUTPUT INSERTED.${outputColumn || columns[0]} VALUES (${valuesStr})`;
  
  return query;
};

/**
 * Build an UPDATE query
 */
export const buildUpdateQuery = (
  tableName: string,
  columns: string[],
  whereClause: string,
  outputColumn?: string
): string => {
  const setClause = columns.map((col) => `${col} = @${col}`).join(', ');
  let query = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
  
  if (outputColumn) {
    query = `UPDATE ${tableName} SET ${setClause} OUTPUT INSERTED.${outputColumn} WHERE ${whereClause}`;
  }
  
  return query;
};

/**
 * Build a DELETE query
 */
export const buildDeleteQuery = (
  tableName: string,
  whereClause: string
): string => {
  return `DELETE FROM ${tableName} WHERE ${whereClause}`;
};

/**
 * Convert object to SQL parameters
 */
export const objectToParams = (obj: Record<string, any>): sql.Request => {
  const request = new sql.Request();
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== undefined && obj[key] !== null) {
      request.input(key, obj[key]);
    }
  });
  return request;
};

