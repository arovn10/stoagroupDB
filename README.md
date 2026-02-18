# Stoa Group Database - Azure SQL Database Project

This repository contains all scripts, data files, and documentation for the Stoa Group real estate portfolio and banking database.

## 📁 Folder Structure

### `/api/`
REST API server and scripts:
- **`src/`** - TypeScript source code (controllers, routes, middleware)
- **`scripts/`** - Database manipulation and import scripts
- **`dist/`** - Compiled JavaScript (generated)
- **`DEPLOYMENT_GUIDE.md`** - How to deploy the API
- **`SETUP_GUIDE.md`** - API setup instructions

### `/schema/`
Database schema creation scripts:
- **`01_create_schema.sql`** - Creates all database tables, schemas, and constraints
- **`clear_all_tables.sql`** - Utility script to clear all data (for testing/reset)
- **`add_*.sql`** - Migration scripts for adding columns and constraints

### `/data/`
Data population scripts and source CSV files:
- **`03_populate_data.sql`** - Populates the database with data from CSV files
- **`Banking Dashboard(*).csv`** - Source CSV files for banking data
- **`Stoa Properties Tracker(*).csv`** - Source CSV files for property data

### `/docs/`
Organized documentation:
- **`api/`** - API documentation and guides
- **`setup/`** - Setup and configuration guides
- **`guides/`** - Implementation guides for specific features
- **`domo/`** - Domo integration guides and examples
- **`data-import/`** - Data import guides
- **`reference/`** - Reference documentation

### `/domo/`
Domo integration queries:
- **`04_domo_table_by_table.sql`** - SQL queries for Domo to pull each table individually
- **`05_domo_dataset_names.md`** - Suggested names and descriptions for each Domo DataSet
- **`08_domo_history_queries.sql`** - Queries for accessing historical/audit data in Domo

### `/audit/`
Audit tracking system:
- **`07_create_audit_tracking.sql`** - Creates audit tables, triggers, and functions for change tracking
- **`09_audit_tracking_guide.md`** - Guide on how to use the audit tracking system
- **`12_audit_tracking_guide.md`** - Comprehensive audit tracking guide

### `/utilities/`
Utility scripts and guides:
- **`06_azure_firewall_setup_simple.sql`** - Script to configure Azure SQL Database firewall rules
- **`06_azure_firewall_instructions.md`** - Step-by-step guide for firewall configuration

### **`api-client.js`** (repo root – universal client)
Single source of truth for all dashboard repos. A GitHub Action copies it into the other repos when this repo is pushed.

### `/scripts/`
Utility scripts:
- **`domo-resolve-ims-ids.js`** - Script to resolve IMS investor IDs

### `/stoa_seed_csvs/`
Seed CSV and Excel files for data import

## 🚀 Quick Start

1. **Create Schema**: Run `schema/01_create_schema.sql` in Azure SQL Database
2. **Populate Data**: Run `data/03_populate_data.sql` to load initial data
3. **Enable Audit Tracking**: Run `audit/07_create_audit_tracking.sql` to enable change tracking
4. **Configure Firewall**: Follow `utilities/06_azure_firewall_instructions.md` to allow Domo access
5. **Connect Domo**: Use queries from `domo/04_domo_table_by_table.sql` to create DataSets

## 📊 Database Overview

The database is organized into three main schemas:
- **`core`** - Core entities (Project, Bank, Person, EquityPartner)
- **`banking`** - Banking and loan data (Loan, DSCRTest, Covenant, Participation, etc.)
- **`pipeline`** - Pipeline and deal tracking (UnderContract, CommercialListed, etc.)
- **`audit`** - Audit and history tracking (AuditLog, ProjectHistory, LoanHistory)

## 🔄 Data Flow

1. **Source of Truth**: Azure SQL Database is the authoritative source
2. **Domo Integration**: Domo pulls data via SQL queries and can write back changes
3. **External Systems**: Procore, RealPage, and Asana data is matched by ProjectName
4. **Change Tracking**: All modifications are automatically logged in audit tables

## 📝 Key Principles

- **ProjectID is the source of truth** - Every deal gets one unique ProjectId
- **Store only what you control** - Loan terms, dates, amounts, contractual requirements
- **Pull operational data** - % complete, % occupied, actual NOI come from Procore/RealPage
- **Auto-populated fields** - City, State, Region, and ProductType are automatically set
- **Match by ProjectName** - External systems match to projects using ProjectName

## 📚 Documentation

- **API Documentation**: See `docs/api/` for API usage guides
- **Setup Guides**: See `docs/setup/` for authentication, git, and deployment setup
- **Implementation Guides**: See `docs/guides/` for feature-specific implementation guides
- **Domo Guides**: See `docs/domo/` for Domo dashboard setup and integration
- **Data Import**: See `docs/data-import/` for importing data from various sources
- **Reference**: See `docs/reference/` for database structure and data mapping

## 🔑 Important Notes

- **FinancingType Separation**: All banking entities (except Equity Commitments) support `FinancingType` ('Construction' or 'Permanent') to separate financing data
- **Loan Phase Separation**: Construction and Permanent loans are completely separate records
- **Equity Types**: Supports 'Preferred Equity', 'Common Equity', 'Profits Interest', and 'Stoa Loan'
- **Partner Types**: Entity partners can have related parties; Individual partners cannot
