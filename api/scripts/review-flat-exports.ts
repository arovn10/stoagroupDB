#!/usr/bin/env ts-node
/**
 * Review Flat Export CSVs
 * 
 * Analyzes the flat export CSV files for data quality issues
 * 
 * Usage: npm run db:review-flat-exports
 */

import * as fs from 'fs';
import * as path from 'path';
import { getPool } from './db-manipulate';
import sql from 'mssql';

interface ReviewResult {
  file: string;
  totalRows: number;
  issues: string[];
  dataQuality: {
    emptyFields: number;
    nullValues: number;
    duplicates: number;
  };
}

const issues: ReviewResult[] = [];

function parseCSV(csvContent: string): string[][] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;
  
  // Handle Windows (\r\n) and Unix (\n) line endings
  const normalizedContent = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  for (let i = 0; i < normalizedContent.length; i++) {
    const char = normalizedContent[i];
    const nextChar = normalizedContent[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote inside quoted field
        currentLine += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        currentLine += char; // Keep quotes for now
      }
    } else if (char === '\n' && !inQuotes) {
      lines.push(currentLine);
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine) lines.push(currentLine);
  
  return lines.map(line => {
    const fields: string[] = [];
    let field = '';
    inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          field += '"';
          i++;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          // Don't add quote to field value
        }
      } else if (char === ',' && !inQuotes) {
        // Remove surrounding quotes if present
        const cleaned = field.trim().replace(/^"(.*)"$/, '$1');
        fields.push(cleaned);
        field = '';
      } else {
        field += char;
      }
    }
    // Remove surrounding quotes if present
    const cleaned = field.trim().replace(/^"(.*)"$/, '$1');
    fields.push(cleaned);
    return fields;
  });
}

async function reviewFile(filePath: string, fileName: string): Promise<ReviewResult> {
  const csvContent = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(csvContent);
  
  if (rows.length === 0) {
    return {
      file: fileName,
      totalRows: 0,
      issues: ['File is empty'],
      dataQuality: { emptyFields: 0, nullValues: 0, duplicates: 0 }
    };
  }
  
  const headers = rows[0];
  const dataRows = rows.slice(1);
  const result: ReviewResult = {
    file: fileName,
    totalRows: dataRows.length,
    issues: [],
    dataQuality: {
      emptyFields: 0,
      nullValues: 0,
      duplicates: 0
    }
  };
  
  // Check for empty rows
  const emptyRows = dataRows.filter(row => row.every(cell => !cell || cell.trim() === ''));
  if (emptyRows.length > 0) {
    result.issues.push(`${emptyRows.length} empty row(s)`);
  }
  
  // Check for missing headers
  if (headers.length === 0) {
    result.issues.push('No headers found');
  }
  
  // Check for duplicate rows
  const rowStrings = dataRows.map(row => row.join('|'));
  const uniqueRows = new Set(rowStrings);
  if (rowStrings.length !== uniqueRows.size) {
    result.dataQuality.duplicates = rowStrings.length - uniqueRows.size;
    result.issues.push(`${result.dataQuality.duplicates} duplicate row(s)`);
  }
  
  // Check for null/empty values in key columns
  if (headers.includes('ProjectName')) {
    const projectNameCol = headers.indexOf('ProjectName');
    const emptyProjects = dataRows.filter(row => !row[projectNameCol] || row[projectNameCol].trim() === '');
    if (emptyProjects.length > 0) {
      result.issues.push(`${emptyProjects.length} row(s) with missing ProjectName`);
      result.dataQuality.emptyFields += emptyProjects.length;
    }
  }
  
  // Check for inconsistent data types
  if (headers.includes('ConstructionLoanAmount')) {
    const amountCol = headers.indexOf('ConstructionLoanAmount');
    const invalidAmounts = dataRows.filter(row => {
      const val = row[amountCol];
      if (!val || val.trim() === '') return false;
      const num = parseFloat(val.replace(/[$,]/g, ''));
      return isNaN(num);
    });
    if (invalidAmounts.length > 0) {
      result.issues.push(`${invalidAmounts.length} row(s) with invalid loan amounts`);
    }
  }
  
  // Check row length consistency
  const rowLengths = dataRows.map(row => row.length);
  const expectedLength = headers.length;
  const inconsistentRows = rowLengths.filter(len => len !== expectedLength).length;
  if (inconsistentRows > 0) {
    result.issues.push(`${inconsistentRows} row(s) with inconsistent column count (expected ${expectedLength}, found varying)`);
  }
  
  return result;
}

async function compareWithDatabase(pool: sql.ConnectionPool, fileName: string, csvRows: string[][]): Promise<string[]> {
  const issues: string[] = [];
  
  if (fileName === 'projects.csv' && csvRows.length > 1) {
    const headers = csvRows[0];
    const projectNameCol = headers.indexOf('ProjectName');
    
    if (projectNameCol >= 0) {
      const csvProjects = new Set(csvRows.slice(1).map(row => row[projectNameCol]?.trim()).filter(Boolean));
      
      const dbResult = await pool.request().query('SELECT ProjectName FROM core.Project');
      const dbProjects = new Set(dbResult.recordset.map((r: any) => r.ProjectName));
      
      // Find projects in CSV but not in DB
      const missingInDB = Array.from(csvProjects).filter(p => !dbProjects.has(p));
      if (missingInDB.length > 0) {
        issues.push(`${missingInDB.length} project(s) in CSV but not in database: ${missingInDB.slice(0, 5).join(', ')}${missingInDB.length > 5 ? '...' : ''}`);
      }
      
      // Find projects in DB but not in CSV
      const missingInCSV = Array.from(dbProjects).filter(p => !csvProjects.has(p));
      if (missingInCSV.length > 0) {
        issues.push(`${missingInCSV.length} project(s) in database but not in CSV: ${missingInCSV.slice(0, 5).join(', ')}${missingInCSV.length > 5 ? '...' : ''}`);
      }
    }
  }
  
  if (fileName === 'loans.csv' && csvRows.length > 1) {
    const headers = csvRows[0];
    const projectNameCol = headers.indexOf('ProjectName');
    
    if (projectNameCol >= 0) {
      const csvProjects = new Set(csvRows.slice(1).map(row => row[projectNameCol]?.trim()).filter(Boolean));
      
      // Check if projects exist in database
      for (const projectName of csvProjects) {
        const result = await pool.request()
          .input('name', sql.NVarChar, projectName)
          .query('SELECT ProjectId FROM core.Project WHERE ProjectName = @name');
        
        if (result.recordset.length === 0) {
          issues.push(`Loan for project "${projectName}" - project not found in database`);
        }
      }
    }
  }
  
  return issues;
}

async function main() {
  console.log('🔍 Reviewing Flat Export CSVs...\n');
  
  const exportsDir = path.join(__dirname, '../../stoa_flat_exports_csv');
  const files = fs.readdirSync(exportsDir).filter(f => f.endsWith('.csv') && !f.startsWith('_'));
  
  const pool = await getPool();
  
  try {
    for (const fileName of files) {
      const filePath = path.join(exportsDir, fileName);
      console.log(`📄 Reviewing ${fileName}...`);
      
      const review = await reviewFile(filePath, fileName);
      
      // Compare with database for key files
      if (fileName === 'projects.csv' || fileName === 'loans.csv') {
        const csvContent = fs.readFileSync(filePath, 'utf-8');
        const csvRows = parseCSV(csvContent);
        const dbIssues = await compareWithDatabase(pool, fileName, csvRows);
        review.issues.push(...dbIssues);
      }
      
      issues.push(review);
      
      if (review.issues.length > 0) {
        console.log(`  ⚠️  Found ${review.issues.length} issue(s)`);
      } else {
        console.log(`  ✅ No issues found`);
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 REVIEW SUMMARY');
    console.log('='.repeat(80));
    
    const filesWithIssues = issues.filter(r => r.issues.length > 0);
    
    if (filesWithIssues.length === 0) {
      console.log('\n✅ All files look good! No issues found.\n');
    } else {
      console.log(`\n⚠️  Found issues in ${filesWithIssues.length} file(s):\n`);
      
      filesWithIssues.forEach(review => {
        console.log(`\n📄 ${review.file}`);
        console.log(`   Total Rows: ${review.totalRows}`);
        console.log(`   Issues:`);
        review.issues.forEach(issue => {
          console.log(`     - ${issue}`);
        });
      });
    }
    
    // Print data quality summary
    console.log('\n' + '='.repeat(80));
    console.log('📈 DATA QUALITY SUMMARY');
    console.log('='.repeat(80));
    
    issues.forEach(review => {
      if (review.dataQuality.duplicates > 0 || review.dataQuality.emptyFields > 0) {
        console.log(`\n${review.file}:`);
        if (review.dataQuality.duplicates > 0) {
          console.log(`  - ${review.dataQuality.duplicates} duplicate row(s)`);
        }
        if (review.dataQuality.emptyFields > 0) {
          console.log(`  - ${review.dataQuality.emptyFields} row(s) with empty key fields`);
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error reviewing files:', error);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  main();
}
