# Stoa Group Database - Azure SQL Database Project

This repository contains all scripts, data files, and documentation for the Stoa Group real estate portfolio and banking database.

## 📁 Folder Structure

### `/schema/`
Database schema creation scripts:
- **`01_create_schema.sql`** - Creates all database tables, schemas, and constraints
- **`clear_all_tables.sql`** - Utility script to clear all data (for testing/reset)

### `/data/`
Data population scripts and source CSV files:
- **`03_populate_data.sql`** - Populates the database with data from CSV files
- **`Banking Dashboard(*).csv`** - Source CSV files for banking data
- **`Stoa Properties Tracker(*).csv`** - Source CSV files for property data

### `/domo/`
Domo integration queries and guides:
- **`04_domo_table_by_table.sql`** - SQL queries for Domo to pull each table individually
- **`05_domo_dataset_names.md`** - Suggested names and descriptions for each Domo DataSet
- **`08_domo_history_queries.sql`** - Queries for accessing historical/audit data in Domo

### `/audit/`
Audit tracking system:
- **`07_create_audit_tracking.sql`** - Creates audit tables, triggers, and functions for change tracking
- **`09_audit_tracking_guide.md`** - Guide on how to use the audit tracking system

### `/utilities/`
Utility scripts and guides:
- **`06_azure_firewall_setup_simple.sql`** - Script to configure Azure SQL Database firewall rules
- **`06_azure_firewall_instructions.md`** - Step-by-step guide for firewall configuration

### `/docs/`
Documentation:
- **`02_data_mapping_review.md`** - Data mapping guide showing what to store vs. pull from external sources

## 🚀 Setup Instructions

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

# stoagroupDB
