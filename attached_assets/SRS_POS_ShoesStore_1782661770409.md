SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **SOFTWARE REQUIREMENTS SPECIFICATION** 

## **& TECHNICAL BLUEPRINT** 

──────────────────────────────────── 

**Multi-Tenant SaaS Point of Sale, Inventory Management & Financial Management System** 

_Specialized for Shoe Retail Stores_ 

Document Version: 1.0 Classification: Confidential — Internal Use Only UI Language: Arabic (RTL) | Documentation Language: English Date: Sun Jun 28 2026 

Page 1 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 1: System Overview** 

## **1.1 Executive Summary** 

This document defines the complete Software Requirements Specification (SRS) and Technical Blueprint for a multi-tenant Software-as-a-Service (SaaS) Point of Sale (POS), Inventory Management, and Financial Management System designed specifically for shoe retail stores. 

The system will provide store owners with a unified platform to manage sales, purchases, inventory, customers, suppliers, employees, treasury, and financial reporting — all from an intuitive Arabiclanguage (RTL) interface. 

## **1.2 System Goals** 

- Provide a fully operational retail POS with barcode scanning and multi-payment support 

- Deliver complete inventory lifecycle management including variants (size, color) 

- Implement double-entry bookkeeping with automatic ledger entries 

- Ensure real-time treasury tracking across all financial operations 

- Support multi-tenant SaaS architecture with complete data isolation 

- Enable role-based access control with comprehensive audit logging 

- Generate actionable business intelligence via dashboards and reports 

## **1.3 Scope** 

The system covers the following functional domains: 

|**Domain**|**Key Functions**|**Priority**|
|---|---|---|
|Sales & POS|New sale, returns, suspended orders,<br>receipts|Critical|
|Inventory|Products, variants, warehouses,<br>transfers, adjustments|Critical|
|Purchasing|Purchase invoices, returns, supplier<br>management|Critical|
|Finance|Expenses, salaries, capital,<br>withdrawals|Critical|
|Treasury|Cash in/out, sessions, balance tracking|Critical|
|Customers|Accounts, credit, statements, history|High|
|Suppliers|Accounts, payments, purchase history|High|
|Reports|Sales, P&L, inventory,<br>daily/monthly/yearly|High|
|Users & Permissions|RBAC, roles, audit logs|High|



Page 2 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

|**Domain**|**Key Functions**|**Priority**|
|---|---|---|
|Notifications|Low stock, debt alerts, treasury<br>warnings|Medium|
|Settings|Store config, printers, tax, barcode|Medium|



## **1.4 Out of Scope** 

- E-commerce or online store functionality 

- Multi-currency transactions (single store currency) 

- Loyalty points or reward programs 

- Advanced CRM or marketing automation 

- Mobile native app (web-based only, mobile responsive) 

## **1.5 Key Design Principles** 

1. Arabic-First UI: All screens, labels, buttons, receipts, and invoices are rendered in Arabic with RTL layout 

2. Inventory Immutability: Inventory quantities are never edited directly; all changes flow through inventory movement records 

3. Treasury Completeness: Every money movement must generate a treasury transaction — no exceptions 

4. Double-Entry Accounting: Every financial event produces balanced ledger entries automatically 

5. Optional Customer: Sales can be completed without selecting a customer (walk-in cash sales) 

6. Multi-Tenant Isolation: Every business entity includes StoreId; data is completely isolated per tenant 

Page 3 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 2: Multi-Tenant Architecture** 

## **2.1 Architecture Model** 

The system uses a Shared Database, Shared Schema multi-tenant model with strict row-level data isolation enforced by StoreId on every business table. This is the most cost-effective model for SaaS with thousands of tenants while maintaining strong isolation. 

## **2.2 Tenant Isolation Strategy** 

|**Layer**|**Isolation Mechanism**|**Enforcement Point**|
|---|---|---|
|Database|StoreId column on every business<br>table|DB constraints +<br>application layer|
|API|JWT token contains StoreId claim|Middleware on every<br>request|
|Application|BaseRepository filters by StoreId|Repository pattern / ORM<br>global filter|
|Files/Media|Tenant-prefixed storage paths|File service layer|
|Cache|Cache keys prefixed with StoreId|Cache service wrapper|



## **2.3 Tenant Lifecycle** 

- Tenant Registration: Setup Wizard creates store record and first admin user 

- Tenant Activation: Store becomes active after wizard completion 

- Data Access: All queries automatically scoped to current tenant via middleware 

- Tenant Isolation: No cross-tenant data access is architecturally possible 

## **2.4 Scalability Targets** 

|**Metric**|**Target**|
|---|---|
|Concurrent Tenants|10,000+ stores|
|Concurrent Users per Tenant|Up to 50|
|Daily Transactions per Tenant|Up to 1,000 invoices|
|API Response Time (P95)|< 300ms|
|Database Query Time (P95)|< 50ms|
|System Uptime|99.9% SLA|



Page 4 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 3: Authentication & Setup Wizard** 

## **3.1 Setup Wizard** 

When the application is accessed for the first time (no store record exists in the database), the user is redirected to the Setup Wizard. This wizard runs exactly once per tenant. After completion, accessing the setup URL redirects to the login page. 

## **3.2 Setup Wizard Steps** 

|**Step**|**Fields**|**Validation Rules**|
|---|---|---|
|1 — Store<br>Information|Store Name, Phone, Address, City,<br>Currency, Tax Rate, Logo|Name required;<br>Phone valid format;<br>Currency from<br>dropdown|
|2 — Receipt Printer|Printer Width (58mm / 80mm), Paper<br>Type|One option must be<br>selected|
|3 — Administrator<br>Account|Full Name, Username, Password,<br>Confirm Password|Username unique;<br>Password min 8<br>chars; Passwords<br>must match|
|4 — Review &<br>Confirm|Summary of all entered data|User confirms before<br>submission|



## **3.3 Authentication Flow** 

- JWT-based authentication with access token (15 min) and refresh token (7 days) 

- Login requires Username + Password 

- Failed login attempts: lock account after 5 consecutive failures for 15 minutes 

- Password reset available via admin override (no email required for offline stores) 

- All API endpoints require valid JWT except /setup and /login 

## **3.4 Session Management** 

|**Token Type**|**Lifetime**|**Storage**|**Refresh**<br>**Strategy**|
|---|---|---|---|
|Access Token|15 minutes|Memory (not<br>localStorage)|Silent refresh on<br>expiry|
|Refresh Token|7 days|HttpOnly cookie|Rotated on each<br>use|



Page 5 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 4: Dashboard Module** 

## **4.1 KPI Cards** 

|**KPI**|**Calculation**|**Update**<br>**Frequency**|
|---|---|---|
|Today's Sales|Sum of all invoice totals for current<br>date|Real-time|
|Today's Profit|Today's Sales Revenue - Cost of<br>Goods Sold|Real-time|
|Today's Purchases|Sum of all purchase invoice totals for<br>current date|Real-time|
|Today's Expenses|Sum of all expense transactions for<br>current date|Real-time|
|Treasury Balance|Current treasury closing balance|Real-time|
|Low Stock Products|Count of products where quantity <=<br>reorder point|Every 5 min|
|Customer Debts|Sum of all positive customer balances|Every 5 min|
|Supplier Debts|Sum of all positive supplier balances|Every 5 min|



## **4.2 Dashboard Charts** 

|**Chart**|**Type**|**Data Source**|**Period**|
|---|---|---|---|
|Daily Sales|Bar Chart|Invoices grouped by day|Last 30<br>days|
|Monthly Revenue|Line Chart|Invoices grouped by month|Last 12<br>months|
|Cash Flow|Area Chart|Treasury transactions in/out|Last 30<br>days|
|Best Selling Products|Horizontal Bar|Invoice items grouped by<br>product|Last 30<br>days|
|Sales by Payment<br>Method|Pie Chart|Invoice payments grouped<br>by method|Current<br>month|
|Category Performance|Donut Chart|Invoice items grouped by<br>category|Current<br>month|



## **4.3 Quick Access Panel** 

- New Sale (shortcut to POS screen) 

- New Purchase (shortcut to purchase form) 

Page 6 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

- Low Stock Alerts (list of items needing reorder) 

- Pending Customer Payments (customers with overdue balances) 

- Today's Treasury Summary 

Page 7 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 5: Sales Module** 

## **5.1 New Sale (POS Screen)** 

The POS screen is the primary operational interface for cashiers. It must be optimized for speed and barcode scanning workflow. 

## **5.2 POS Screen Components** 

|**Component**|**Function**|
|---|---|
|Product Search Bar|Search by name, barcode, or SKU with instant results|
|Barcode Scanner Input|Auto-detects scanner input (keyboard wedge or USB<br>scanner)|
|Cart / Order Items|List of selected items with quantity, price, discount<br>controls|
|Customer Selector|Optional: search and attach customer to invoice|
|Discount Panel|Apply item-level or invoice-level percentage/amount<br>discounts|
|Payment Panel|Select one or more payment methods with amounts|
|Invoice Summary|Subtotal, discount, tax, total, amount paid, change due|
|Action Buttons|Complete Sale, Suspend Order, Cancel, Print Receipt|



## **5.3 Sale Completion Workflow** 

7. Cashier scans or searches products → items added to cart 

8. Optionally select customer (if credit sale or customer wants receipt) 

9. Apply discounts if applicable 

10. Select payment method(s) and enter amounts 

11. System validates: total paid >= invoice total (or customer has credit limit) 

12. On confirmation, system atomically executes: 

   - Creates Invoice record 

   - Creates InvoiceItem records for each cart item 

   - Reduces inventory (creates InventoryMovement records) 

   - Creates TreasuryTransaction(s) for each payment method 

   - Creates AccountingTransaction (debit Accounts Receivable / cash, credit Sales Revenue + COGS) 

   - Updates Customer balance if customer selected 

13. System prints receipt (58mm or 80mm based on settings) 

Page 8 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

14. POS screen resets for next sale 

## **5.4 Payment Methods** 

A single invoice may contain multiple payment methods. The sum of all payment amounts must equal the invoice total (for non-credit sales). 

|**Payment Method**|**Treasury Effect**|**Notes**|
|---|---|---|
|Cash|Increases cash treasury<br>balance|Default method|
|Visa/Card|Increases card treasury<br>account|May have processing fee|
|InstaPay|Increases InstaPay treasury<br>account|Digital payment|
|Vodafone Cash|Increases VF Cash treasury<br>account|Mobile payment|
|Customer Credit|Increases customer<br>balance (debt)|Requires customer selection|



## **5.5 Suspended Orders** 

- A sale can be suspended (saved as draft) at any point 

- Suspended orders do not reduce inventory or create financial transactions 

- Multiple orders can be suspended simultaneously 

- Cashier can resume any suspended order by selecting it 

- Suspended orders are store-scoped (not user-scoped) 

## **5.6 Sales Return** 

## **5.6.1 Return Search** 

- Search by Invoice Number (system-assigned) 

- Search by Invoice Barcode (printed on receipt) 

## **5.6.2 Return Types** 

|**Return Type**|**Description**|**Inventory Effect**|
|---|---|---|
|Full Return|All items in invoice are returned|All quantities restored to<br>warehouse|
|Partial Return|Selected items or quantities<br>returned|Only returned quantities<br>restored|



Page 9 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **5.6.3 Return Process** 

15. Locate original invoice by number or barcode 

16. Select items and quantities to return (partial or full) 

17. Specify refund method (cash, original payment method) 

18. On confirmation, system atomically executes: 

   - Creates SalesReturn record linked to original invoice 

   - Creates SalesReturnItem records 

   - Restores inventory (creates InventoryMovement records with type = RETURN) 

   - Creates TreasuryTransaction (cash out / refund) 

   - Creates AccountingTransaction (reverses original sale entries) 

   - Updates Customer balance if applicable 

## **5.7 Sales History** 

- List all invoices with filters: date range, customer, payment method, status 

- Click any invoice to view full details 

- Reprint receipt for any historical invoice 

- Mark invoice as partially paid (for credit customers) 

- View payment history per invoice 

Page 10 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 6: Customer Module** 

## **6.1 Design Philosophy** 

CRITICAL: Customers are optional in this system. This is NOT a customer loyalty or CRM system. The vast majority of transactions are walk-in cash sales with no customer attached. Customer accounts are created only when a customer purchases on credit or specifically requests an account for tracking purposes. 

**Note:** _Walk-in sales (no customer selected) are treated as anonymous cash sales. No customer account is required._ 

## **6.2 Customer Fields** 

|**Field**|**Type**|**Required**|**Notes**|
|---|---|---|---|
|CustomerID|UUID|System|Auto-generated|
|StoreId|UUID|System|Multi-tenant isolation|
|Name|VARCHAR(100)|Yes|Full name|
|Phone|VARCHAR(20)|Yes|Primary contact|
|Address|TEXT|No|Delivery address|
|CreditLimit|DECIMAL(12,2)|No|Max allowed debt; 0 =<br>no credit|
|CurrentBalance|DECIMAL(12,2)|System|Auto-calculated from<br>transactions|
|Notes|TEXT|No|Free text notes|
|IsActive|BOOLEAN|System|Soft delete flag|
|CreatedAt|TIMESTAMP|System|Auto-generated|



## **6.3 Credit Limit Rules** 

- If CreditLimit = 0: Customer cannot purchase on credit 

- If CreditLimit > 0: Customer can carry a debt up to that limit 

- System validates before completing a credit sale: CurrentBalance + SaleAmount <= CreditLimit 

- Admin can override credit limit with appropriate permission 

## **6.4 Customer Module Screens** 

|**Screen**|**Function**|
|---|---|
|Customer List|Searchable, filterable list with balance indicators|



Page 11 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

|**Screen**|**Function**|
|---|---|
|Customer Form|Create/Edit customer with all fields|
|Customer Statement|Chronological list of all transactions with running<br>balance|
|Purchase History|All invoices linked to this customer|
|Payment History|All payments received from this customer|
|Record Payment|Accept payment from customer, reduces their debt|



Page 12 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 7: Supplier Module** 

## **7.1 Supplier Fields** 

|**Field**|**Type**|**Required**|**Notes**|
|---|---|---|---|
|SupplierID|UUID|System|Auto-generated|
|StoreId|UUID|System|Multi-tenant isolation|
|Name|VARCHAR(100)|Yes|Company or person<br>name|
|Phone|VARCHAR(20)|Yes|Primary contact|
|Address|TEXT|No|Business address|
|TaxNumber|VARCHAR(50)|No|VAT/Tax ID|
|CurrentBalance|DECIMAL(12,2)|System|Amount owed to<br>supplier|
|Notes|TEXT|No|Free text notes|
|IsActive|BOOLEAN|System|Soft delete flag|



## **7.2 Supplier Module Screens** 

|**Screen**|**Function**|
|---|---|
|Supplier List|Searchable list with balance indicators|
|Supplier Form|Create/Edit supplier|
|Supplier Statement|All transactions with running balance|
|Purchase History|All purchase invoices from this supplier|
|Payment History|All payments made to this supplier|
|Record Payment|Pay supplier, reduces their balance|



Page 13 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 8: Purchase Module** 

## **8.1 Purchase Invoice** 

Purchases record incoming stock from suppliers. Every purchase increases inventory and either creates a supplier debt or records a treasury payment. 

## **8.2 Purchase Invoice Fields** 

|**Field**|**Type**|**Notes**|
|---|---|---|
|InvoiceNumber|VARCHAR(20)|Auto-generated per store sequence|
|SupplierInvoiceNumber|VARCHAR(50)|Supplier's own reference number|
|SupplierId|UUID FK|Required for all purchases|
|InvoiceDate|DATE|Date of purchase|
|DueDate|DATE|Payment due date (if on credit)|
|SubTotal|DECIMAL(12,2)|Sum of line items before tax|
|TaxAmount|DECIMAL(12,2)|Calculated tax|
|TotalAmount|DECIMAL(12,2)|Final invoice total|
|AmountPaid|DECIMAL(12,2)|Paid at time of purchase|
|RemainingBalance|DECIMAL(12,2)|Owed to supplier|
|Status|ENUM|DRAFT, CONFIRMED, PARTIAL,<br>PAID|
|WarehouseId|UUID FK|Receiving warehouse|
|Notes|TEXT|Internal notes|



## **8.3 Purchase Process Workflow** 

19. Select supplier 

20. Add purchase items: product variant, quantity, cost price 

21. Select receiving warehouse 

22. Enter supplier's invoice number and date 

23. Choose payment: pay now (full/partial) or on credit 

24. On confirmation, system executes: 

   - Creates PurchaseInvoice record 

   - Creates PurchaseInvoiceItem records 

   - Increases inventory per warehouse (creates InventoryMovement records with type = PURCHASE) 

Page 14 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

- If paid: Creates TreasuryTransaction (cash out) + AccountingTransaction 

- If on credit: Increases supplier balance + Creates AccountingTransaction (debit Inventory, credit Accounts Payable) 

## **8.4 Purchase Return** 

- Can return full or partial quantities from a purchase invoice 

- Requires reason for return 

- Reduces inventory (InventoryMovement type = PURCHASE_RETURN) 

- Reduces supplier balance or creates credit note 

- Creates reversal accounting entries 

Page 15 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 9: Inventory Module** 

## **9.1 Design Principles** 

- Inventory quantities are NEVER edited directly in the database 

- All inventory changes flow through InventoryMovement records 

- Current quantity is always derived from the sum of movements (or cached and synced) 

- Every movement records: product, warehouse, quantity change, type, reference, user, timestamp 

## **9.2 Product Structure** 

Shoes have complex variant structures: each product has multiple sizes and colors, and each combination (variant) has its own SKU, barcode, and inventory quantity. 

|**Entity**|**Description**|**Examples**|
|---|---|---|
|Category|Top-level product grouping|Men's, Women's, Kids',<br>Sports|
|Brand|Manufacturer or brand name|Nike, Adidas, Clarks,<br>Local Brand|
|Color|Color master list|Black, White, Brown,<br>Red, Navy|
|Size|Size master list with system|38, 39, 40, 41, 42 (EU) or<br>7, 8, 9 (US)|
|Product|Base product definition|Nike Air Max 270|
|ProductVariant|Specific size+color combo|Nike Air Max 270, Size<br>42, Color: Black|
|InventoryItem|Stock per variant per warehouse|Nike Air Max 270, 42,<br>Black at Main Store: 5<br>pcs|



## **9.3 Product Fields** 

|**Field**|**Type**|**Notes**|
|---|---|---|
|ProductId|UUID|Auto-generated|
|StoreId|UUID FK|Tenant isolation|
|Name|VARCHAR(200)|Product name in Arabic|
|NameEn|VARCHAR(200)|Optional English name|
|CategoryId|UUID FK|Product category|



Page 16 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

|**Field**|**Type**|**Notes**|
|---|---|---|
|BrandId|UUID FK|Brand (nullable)|
|Description|TEXT|Product description|
|BasePrice|DECIMAL(10,2)|Default selling price|
|BaseCostPrice|DECIMAL(10,2)|Default cost price|
|ReorderPoint|INTEGER|Low stock threshold|
|IsActive|BOOLEAN|Soft delete|
|Barcode|VARCHAR(50)|Product-level barcode (optional)|



## **9.4 Product Variant Fields** 

|**Field**|**Type**|**Notes**|
|---|---|---|
|VariantId|UUID|Auto-generated|
|ProductId|UUID FK|Parent product|
|StoreId|UUID FK|Tenant isolation|
|ColorId|UUID FK|Color from master list|
|SizeId|UUID FK|Size from master list|
|SKU|VARCHAR(50)|Unique stock-keeping unit|
|Barcode|VARCHAR(50)|Unique barcode for this variant|
|SellingPrice|DECIMAL(10,2)|Override selling price (null = use<br>product base price)|
|CostPrice|DECIMAL(10,2)|Override cost price|
|IsActive|BOOLEAN|Soft delete|



## **9.5 Inventory Movement Types** 

|**Movement Type**|**Direction**|**Triggered By**|
|---|---|---|
|SALE|OUT (-)|Completing a sale invoice|
|SALE_RETURN|IN (+)|Processing a sales return|
|PURCHASE|IN (+)|Confirming a purchase invoice|
|PURCHASE_RETURN|OUT (-)|Processing a purchase return|
|ADJUSTMENT_IN|IN (+)|Manual inventory adjustment (found<br>stock)|
|ADJUSTMENT_OUT|OUT (-)|Manual inventory adjustment<br>(damaged/lost)|



Page 17 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

|**Movement Type**|**Direction**|**Triggered By**|
|---|---|---|
|TRANSFER_OUT|OUT (-)|Warehouse transfer (source<br>warehouse)|
|TRANSFER_IN|IN (+)|Warehouse transfer (destination<br>warehouse)|
|STOCK_COUNT_CORREC<br>TION|IN/OUT|Physical stock count discrepancy<br>correction|



## **9.6 Warehouse Management** 

- Multiple warehouses supported per store 

- Each inventory item is tracked per warehouse 

- Warehouse transfers create paired TRANSFER_OUT + TRANSFER_IN movements 

- Transfer status: PENDING → IN_TRANSIT → COMPLETED 

- Cannot sell from a warehouse that has insufficient stock 

## **9.7 Stock Count Process** 

25. Initiate stock count for a warehouse (system records expected quantities) 

26. Staff physically counts items and enters actual quantities 

27. System calculates variance: actual - expected 

28. Manager reviews and approves/adjusts variances 

29. On approval: system creates STOCK_COUNT_CORRECTION movements for all variances 

30. Stock count is closed and locked 

Page 18 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 10: Finance Module** 

## **10.1 Finance Module Components** 

|**Component**|**Description**|**Treasury Effect**|
|---|---|---|
|Expenses|Operational costs (rent, utilities,<br>supplies)|Cash OUT|
|Expense Categories|Classification of expense types|N/A|
|Owner Withdrawals|Owner takes money from business|Cash OUT, Equity<br>DOWN|
|Capital Deposits|Owner injects capital into business|Cash IN, Equity UP|
|Employee Salaries|Monthly salary records per<br>employee|Liability created|
|Employee Advances|Salary advance given to employee|Cash OUT, Advance<br>Asset UP|
|Salary Payments|Actual payment of salary (minus<br>advances)|Cash OUT, Liability<br>cleared|



## **10.2 Expense Management** 

|**Field**|**Type**|**Notes**|
|---|---|---|
|ExpenseId|UUID|Auto-generated|
|StoreId|UUID FK|Tenant isolation|
|CategoryId|UUID FK|Expense category|
|Amount|DECIMAL(12,2)|Expense amount|
|ExpenseDate|DATE|Date of expense|
|Description|TEXT|What was purchased/paid|
|PaymentMethod|ENUM|CASH, CARD, TRANSFER|
|ReceiptNumber|VARCHAR(50)|External receipt reference|
|RecordedBy|UUID FK → Users|Who recorded the expense|



## **10.3 Employee & Payroll** 

|**Field**|**Type**|**Notes**|
|---|---|---|
|EmployeeId|UUID|Auto-generated|
|StoreId|UUID FK|Tenant isolation|



Page 19 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

|**Field**|**Type**|**Notes**|
|---|---|---|
|UserId|UUID FK → Users|Linked system user account (nullable)|
|Name|VARCHAR(100)|Full name|
|Position|VARCHAR(50)|Job title|
|BaseSalary|DECIMAL(10,2)|Monthly base salary|
|HireDate|DATE|Employment start date|
|IsActive|BOOLEAN|Employment status|



## **10.4 Payroll Workflow** 

31. System generates monthly salary record for each active employee 

32. HR records any advances paid during the month 

33. At month end, calculate: Net Salary = Base Salary - Advances 

34. Record salary payment → creates TreasuryTransaction (cash out) 

35. Creates AccountingTransaction: Debit Salary Expense, Credit Cash 

## **10.5 Accounting & Ledger Design** 

The system implements double-entry bookkeeping with automatic journal entries for every financial event. 

## **10.5.1 Chart of Accounts** 

|**Account Code**|**Account Name**|**Type**|**Normal**<br>**Balance**|
|---|---|---|---|
|1000|Cash|Asset|Debit|
|1010|Card Receivable|Asset|Debit|
|1100|Accounts Receivable|Asset|Debit|
|1200|Inventory|Asset|Debit|
|1300|Employee Advances|Asset|Debit|
|2000|Accounts Payable|Liability|Credit|
|2100|Salaries Payable|Liability|Credit|
|3000|Owner Equity|Equity|Credit|
|3100|Owner Drawings|Equity|Debit|
|4000|Sales Revenue|Revenue|Credit|
|4100|Sales Returns|Revenue|Debit|



Page 20 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

|**Account Code**|**Account Name**|**Type**|**Normal**<br>**Balance**|
|---|---|---|---|
|||(Contra)||
|5000|Cost of Goods Sold|Expense|Debit|
|5100|Operating Expenses|Expense|Debit|
|5200|Salary Expense|Expense|Debit|



## **10.5.2 Automatic Journal Entries** 

|**Event**|**Debit**|**Credit**|
|---|---|---|
|Cash Sale|Cash (1000)|Sales Revenue (4000) +<br>reduce Inventory (1200) to<br>COGS (5000)|
|Credit Sale|Accounts Receivable<br>(1100)|Sales Revenue (4000)|
|Customer Payment|Cash (1000)|Accounts Receivable (1100)|
|Cash Purchase|Inventory (1200)|Cash (1000)|
|Credit Purchase|Inventory (1200)|Accounts Payable (2000)|
|Supplier Payment|Accounts Payable (2000)|Cash (1000)|
|Expense|Operating Expenses (5100)|Cash (1000)|
|Salary Payment|Salaries Payable (2100)|Cash (1000)|
|Owner Withdrawal|Owner Drawings (3100)|Cash (1000)|
|Capital Deposit|Cash (1000)|Owner Equity (3000)|



Page 21 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 11: Treasury Module** 

## **11.1 Treasury Design Rules** 

- EVERY money movement in the system creates a TreasuryTransaction record 

- No financial operation can bypass the treasury 

- Treasury supports multiple accounts (Cash, Card, InstaPay, Vodafone Cash) 

- Each treasury account has its own running balance 

- Daily sessions track opening/closing balances per shift 

## **11.2 Treasury Transaction Fields** 

|**Field**|**Type**|**Notes**|
|---|---|---|
|TransactionId|UUID|Auto-generated|
|StoreId|UUID FK|Tenant isolation|
|TreasuryAccountId|UUID FK|Which account (Cash, Card, etc.)|
|Type|ENUM|IN, OUT|
|Amount|DECIMAL(12,2)|Transaction amount|
|BalanceAfter|DECIMAL(12,2)|Running balance after this transaction|
|ReferenceType|ENUM|SALE, PURCHASE, EXPENSE,<br>SALARY, WITHDRAWAL, DEPOSIT,<br>CUSTOMER_PAYMENT,<br>SUPPLIER_PAYMENT|
|ReferenceId|UUID|ID of the source record|
|Description|TEXT|Human-readable description|
|SessionId|UUID FK|Daily treasury session|
|CreatedBy|UUID FK → Users|Who performed the transaction|
|CreatedAt|TIMESTAMP|Auto-generated|



## **11.3 Daily Treasury Sessions** 

36. Manager opens treasury session at start of day (enters opening balance) 

37. All transactions during the day are linked to this session 

38. At end of day, manager closes session (system calculates expected closing balance) 

39. Manager counts physical cash and enters actual closing balance 

40. System records any variance (over/short) 

41. Closed sessions are locked and cannot be modified 

Page 22 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 12: Database Architecture** 

## **12.1 Technology Recommendation** 

|**Component**|**Recommended**<br>**Technology**|**Rationale**|
|---|---|---|
|Primary Database|PostgreSQL 15+|ACID compliance, JSON<br>support, excellent<br>performance|
|ORM|Prisma or TypeORM|Type-safe queries, migration<br>management|
|Caching|Redis|Session storage, real-time<br>KPIs, queue|
|Search|PostgreSQL Full-Text<br>Search|Product/customer search<br>without extra service|
|File Storage|S3-compatible (MinIO or<br>AWS S3)|Logo, receipt images, reports|



## **12.2 Core Database Tables** 

## **12.2.1 Tenant & Authentication Tables** 

|**Table**|**Primary Key**|**Key Fields**|**Notes**|
|---|---|---|---|
|Stores|StoreId (UUID)|Name, Phone, Address, Currency,<br>LogoUrl, IsSetupComplete|One per tenant|
|Users|UserId (UUID)|StoreId, RoleId, Username,<br>PasswordHash, FullName, IsActive|RBAC|
|Roles|RoleId (UUID)|StoreId, Name, Permissions<br>(JSONB)|Seeded defaults|
|AuditLogs|LogId (UUID)|StoreId, UserId, Action, EntityType,<br>EntityId, OldValue, NewValue,<br>Timestamp|Immutable|
|Sessions|SessionId (UUID)|UserId, RefreshToken, ExpiresAt,<br>IsRevoked|Auth sessions|



## **12.2.2 Customer & Supplier Tables** 

|**Table**|**Primary Key**|**Key Foreign Keys**|**Notes**|
|---|---|---|---|
|Customers|CustomerId (UUID)|StoreId|Optional;<br>walk-in sales<br>need no<br>customer|



Page 23 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

|**Table**|**Primary Key**|**Key Foreign Keys**|**Notes**|
|---|---|---|---|
|CustomerTransactions|TransactionId (UUID)|StoreId, CustomerId,<br>InvoiceId (nullable)|Running<br>balance log|
|Suppliers|SupplierId (UUID)|StoreId|Required for<br>all purchases|
|SupplierTransactions|TransactionId (UUID)|StoreId, SupplierId,<br>PurchaseInvoiceId<br>(nullable)|Running<br>balance log|



## **12.2.3 Sales Tables** 

|**Table**|**Primary Key**|**Key Foreign Keys**|**Notes**|
|---|---|---|---|
|Invoices|InvoiceId (UUID)|StoreId, CustomerId<br>(nullable), CreatedBy|Master<br>invoice|
|InvoiceItems|ItemId (UUID)|InvoiceId, VariantId, StoreId|Line items|
|InvoicePayments|PaymentId (UUID)|InvoiceId,<br>TreasuryAccountId, StoreId|Multi-<br>payment<br>per invoice|
|SalesReturns|ReturnId (UUID)|InvoiceId, StoreId,<br>CreatedBy|Return<br>header|
|SalesReturnItems|ReturnItemId (UUID)|ReturnId, InvoiceItemId,<br>VariantId, StoreId|Return lines|
|SuspendedOrders|OrderId (UUID)|StoreId, CreatedBy|Draft<br>orders,<br>JSONB cart<br>data|



## **12.2.4 Purchase Tables** 

|**Table**|**Primary Key**|**Key Foreign Keys**|**Notes**|
|---|---|---|---|
|PurchaseInvoices|PurchaseId (UUID)|StoreId, SupplierId,<br>WarehouseId|Purchase<br>master|
|PurchaseInvoiceItems|ItemId (UUID)|PurchaseId, VariantId,<br>StoreId|Purchase<br>line items|
|PurchasePayments|PaymentId (UUID)|PurchaseId,<br>TreasuryAccountId, StoreId|Payments<br>to supplier|
|PurchaseReturns|ReturnId (UUID)|PurchaseId, StoreId|Return to<br>supplier|
|PurchaseReturnItems|ReturnItemId (UUID)|ReturnId, PurchaseItemId,<br>VariantId|Return lines|



Page 24 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **12.2.5 Inventory Tables** 

|**Table**|**Primary Key**|**Key Foreign Keys**|**Notes**|
|---|---|---|---|
|Products|ProductId (UUID)|StoreId, CategoryId,<br>BrandId|Base<br>product|
|ProductVariants|VariantId (UUID)|ProductId, StoreId, ColorId,<br>SizeId|Size+color<br>combos|
|Categories|CategoryId (UUID)|StoreId|Product<br>categories|
|Brands|BrandId (UUID)|StoreId|Brand<br>master list|
|Colors|ColorId (UUID)|StoreId|Color<br>master list|
|Sizes|SizeId (UUID)|StoreId|Size master<br>list|
|Warehouses|WarehouseId (UUID)|StoreId|Storage<br>locations|
|InventoryItems|ItemId (UUID)|VariantId, WarehouseId,<br>StoreId|Stock per<br>variant per<br>warehouse|
|InventoryMovements|MovementId (UUID)|VariantId, WarehouseId,<br>StoreId, ReferenceId|Immutable<br>movement<br>log|
|WarehouseTransfers|TransferId (UUID)|StoreId, FromWarehouseId,<br>ToWarehouseId|Transfer<br>header|
|WarehouseTransferItems|ItemId (UUID)|TransferId, VariantId|Items in<br>transfer|
|InventoryAdjustments|AdjId (UUID)|StoreId, WarehouseId,<br>ApprovedBy|Adjustment<br>header|
|InventoryAdjustmentItem<br>s|ItemId (UUID)|AdjId, VariantId|Adjustment<br>lines|
|StockCounts|CountId (UUID)|StoreId, WarehouseId|Physical<br>count<br>session|
|StockCountItems|ItemId (UUID)|CountId, VariantId|Expected vs<br>actual<br>quantities|



## **12.2.6 Finance & Treasury Tables** 

|**Table**|**Primary Key**|**Key Foreign Keys**|**Notes**|
|---|---|---|---|
|TreasuryAccounts|AccountId (UUID)|StoreId|Cash, Card,|



Page 25 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

|**Table**|**Primary Key**|**Key Foreign Keys**|**Notes**|
|---|---|---|---|
||||InstaPay,<br>VF Cash|
|TreasurySessions|SessionId (UUID)|StoreId, TreasuryAccountId,<br>OpenedBy|Daily shift|
|TreasuryTransactions|TransactionId (UUID)|StoreId, TreasuryAccountId,<br>SessionId|All money<br>movements|
|ExpenseCategories|CategoryId (UUID)|StoreId|Expense<br>types|
|Expenses|ExpenseId (UUID)|StoreId, CategoryId,<br>RecordedBy|Expense<br>records|
|Employees|EmployeeId (UUID)|StoreId, UserId (nullable)|Staff<br>records|
|SalaryRecords|SalaryId (UUID)|StoreId, EmployeeId|Monthly<br>salary|
|EmployeeAdvances|AdvanceId (UUID)|StoreId, EmployeeId|Advances<br>given|
|AccountingAccounts|AccountId (UUID)|StoreId|Chart of<br>accounts|
|AccountingTransactions|TxId (UUID)|StoreId, ReferenceId|Journal<br>entry<br>header|
|AccountingTransactionLi<br>nes|LineId (UUID)|TxId, AccountId|Debit/Credit<br>lines|



## **12.3 Key Indexes** 

|**Table**|**Index Columns**|**Type**|**Purpose**|
|---|---|---|---|
|All tables|StoreId|B-tree|Tenant isolation<br>filter|
|Invoices|StoreId, CreatedAt DESC|B-tree|Date range<br>queries|
|Invoices|StoreId, CustomerId|B-tree|Customer<br>invoice history|
|InvoiceItems|InvoiceId|B-tree|Fast line item<br>retrieval|
|InventoryMovements|VariantId, WarehouseId,<br>StoreId|B-tree|Stock<br>calculation|
|InventoryMovements|ReferenceId,<br>ReferenceType|B-tree|Trace<br>movements to<br>source|



Page 26 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

|**Table**|**Index Columns**|**Type**|**Purpose**|
|---|---|---|---|
|ProductVariants|Barcode, StoreId|B-tree<br>(unique)|Barcode<br>scanner lookup|
|ProductVariants|SKU, StoreId|B-tree<br>(unique)|SKU lookup|
|TreasuryTransactions|StoreId, CreatedAt DESC|B-tree|Treasury history|
|AuditLogs|StoreId, EntityType, EntityId|B-tree|Audit queries|
|Products|StoreId, Name (GIN)|GIN Full-Text|Product name<br>search|
|Customers|StoreId, Phone|B-tree|Customer phone<br>lookup|



## **12.4 Cascade Rules** 

|**Parent**|**Child**|**On Delete**|**Rationale**|
|---|---|---|---|
|Stores|All tenant tables|RESTRICT|Prevent accidental store<br>deletion|
|Invoices|InvoiceItems|CASCADE|Items cannot exist without<br>invoice|
|Invoices|InvoicePayments|CASCADE|Payments tied to invoice|
|ProductVariants|InvoiceItems|RESTRICT|Cannot delete variant with<br>sales history|
|ProductVariants|InventoryMovements|RESTRICT|Preserve movement history|
|Customers|Invoices|RESTRICT|Cannot delete customer with<br>invoices|
|Suppliers|PurchaseInvoices|RESTRICT|Cannot delete supplier with<br>purchases|
|Warehouses|InventoryItems|RESTRICT|Cannot delete warehouse<br>with stock|
|PurchaseInvoices|PurchaseInvoiceItems|CASCADE|Items tied to purchase|



Page 27 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 13: API Architecture** 

## **13.1 API Design Standards** 

- RESTful API with JSON responses 

- All endpoints prefixed with /api/v1/ 

- Authentication via Bearer token in Authorization header 

- StoreId extracted from JWT — never sent as URL parameter by client 

- Standard response envelope: { success, data, error, pagination } 

- HTTP status codes used correctly (200, 201, 400, 401, 403, 404, 409, 422, 500) 

## **13.2 API Endpoints by Module** 

|**Module**|**Endpoint Group**|**Key Operations**|
|---|---|---|
|Auth|/auth|POST /setup, POST /login, POST<br>/refresh, POST /logout|
|Dashboard|/dashboard|GET /kpis, GET /charts/:type|
|Sales|/sales|POST /, GET /, GET /:id, POST /return,<br>GET /suspended, POST /suspend|
|Customers|/customers|CRUD + GET /:id/statement, GET<br>/:id/invoices, POST /:id/payment|
|Suppliers|/suppliers|CRUD + GET /:id/statement, GET<br>/:id/purchases, POST /:id/payment|
|Purchases|/purchases|POST /, GET /, GET /:id, POST /return|
|Products|/products|CRUD + POST /variants, GET<br>/:id/variants, GET /search?q=|
|Categories|/categories|CRUD|
|Brands|/brands|CRUD|
|Colors|/colors|CRUD|
|Sizes|/sizes|CRUD|
|Warehouses|/warehouses|CRUD + GET /:id/stock, POST<br>/transfers|
|Inventory|/inventory|GET /movements, POST /adjustments,<br>POST /stock-count|
|Finance|/finance|POST /expenses, POST /withdrawals,<br>POST /deposits, POST /salary-payment|
|Treasury|/treasury|GET /balance, GET /transactions, POST<br>/sessions/open, POST /sessions/close|



Page 28 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

|**Module**|**Endpoint Group**|**Key Operations**|
|---|---|---|
|Reports|/reports|GET /sales, GET /purchases, GET<br>/inventory, GET /profit-loss, GET /daily|
|Users|/users|CRUD + GET /roles, POST /roles|
|Settings|/settings|GET /, PUT /, GET /printer, PUT /printer|
|Notifications|/notifications|GET /, PUT /:id/read|



## **13.3 Response Envelope** 

Every API response follows this structure: 

```
{ "success": true, "data": { ... }, "pagination": { "page": 1, "pageSize": 20,
"total": 150 } }
```

Page 29 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 14: Security Architecture** 

## **14.1 Security Layers** 

|**Layer**|**Control**|**Implementation**|
|---|---|---|
|Authentication|JWT with short-lived access<br>tokens|Access: 15min, Refresh: 7d<br>HttpOnly cookie|
|Authorization|RBAC with module-level<br>permissions|Permission check middleware<br>on every route|
|Tenant Isolation|StoreId injected by<br>middleware|Never trust client-provided<br>StoreId|
|Input Validation|Schema validation on all<br>inputs|Zod / Joi schemas, SQL<br>injection prevention via ORM|
|Password Security|bcrypt with salt rounds = 12|Passwords never stored in plain<br>text|
|Rate Limiting|Per-IP and per-user rate<br>limits|Login: 5 attempts/15min; API:<br>1000 req/min|
|Audit Trail|Immutable audit log|Every CRUD on sensitive<br>entities logged|
|Data Encryption|Encryption at rest|Database and file storage<br>encrypted|
|HTTPS|TLS 1.3 required|All traffic encrypted in transit|



## **14.2 Permission Matrix** 

|**Module**|**Admin**|**Manager**|**Cashier**|**Inventory Staff**|**Accountant**|
|---|---|---|---|---|---|
|Dashboard|Full|Full|Limited<br>(sales KPIs<br>only)|Limited (stock<br>KPIs)|Full|
|New Sale|Full|Full|Full|None|View Only|
|Sales Returns|Full|Full|None|None|View Only|
|Sales History|Full|Full|Own Sales<br>Only|None|Full|
|Customers|Full|Full|View +<br>Create|None|Full|
|Suppliers|Full|Full|None|View Only|Full|
|Purchases|Full|Full|None|Full|View Only|
|Products|Full|Full|View Only|Full|View Only|
|Inventory|Full|Full|None|Full|View Only|



Page 30 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

|**Module**|**Admin**|**Manager**|**Cashier**|**Inventory Staff**|**Accountant**|
|---|---|---|---|---|---|
|Finance|Full|Full|None|None|Full|
|Treasury|Full|Full|Open/Close<br>Session|None|Full|
|Reports|Full|Full|Sales<br>Reports Only|Inventory<br>Reports|Full|
|Users|Full|View Only|None|None|None|
|Settings|Full|Limited|None|None|None|



## **14.3 Audit Logging** 

Every important system action is logged to the AuditLogs table. Logs are immutable — no UPDATE or DELETE is permitted on this table. 

|**Action Category**|**Logged Events**|
|---|---|
|Sales|Create invoice, complete sale, process return, void<br>invoice|
|Inventory|Adjustments, transfers, stock count corrections|
|Finance|Expenses recorded, salary payments, owner<br>withdrawals/deposits|
|Users|Login, logout, failed login, password change, user<br>created/edited|
|Settings|Any settings change|
|Permissions|Role changes, permission grants/revokes|



Page 31 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 15: Reporting Module** 

## **15.1 Report List** 

|**Report**|**Filters**|**Key Columns**|**Export**|
|---|---|---|---|
|Sales Summary|Date range, customer,<br>payment method|Invoice #, Date,<br>Customer, Total,<br>Payment Method|PDF,<br>Excel|
|Sales Detail|Date range, product,<br>category|Invoice #, Product, Qty,<br>Unit Price, Discount,<br>Total|PDF,<br>Excel|
|Sales Return Report|Date range|Return #, Original<br>Invoice, Product, Qty<br>Returned, Refund<br>Amount|PDF,<br>Excel|
|Purchase Summary|Date range, supplier|Purchase #, Supplier,<br>Date, Total, Status|PDF,<br>Excel|
|Purchase Detail|Date range, product|Purchase #, Product,<br>Qty, Cost Price, Total|PDF,<br>Excel|
|Inventory Stock Report|Warehouse, category,<br>brand|Product, Variant,<br>Warehouse, Qty,<br>Reorder Point, Value|PDF,<br>Excel|
|Inventory Movement|Date range, product,<br>type|Date, Product, Type,<br>Qty Change, Balance,<br>Reference|PDF,<br>Excel|
|Low Stock Alert|Warehouse, category|Product, Current Qty,<br>Reorder Point, Shortage|PDF,<br>Excel|
|Customer Statement|Customer, date range|Date, Type, Description,<br>Debit, Credit, Balance|PDF|
|Customer Aging|As of date|Customer, Current, 30d,<br>60d, 90d+, Total|PDF,<br>Excel|
|Supplier Statement|Supplier, date range|Date, Type, Description,<br>Debit, Credit, Balance|PDF|
|Treasury Report|Date range, account|Date, Type, Amount,<br>Balance, Reference|PDF,<br>Excel|
|Expense Report|Date range, category|Date, Category,<br>Description, Amount|PDF,<br>Excel|
|Profit & Loss|Date range|Revenue, COGS, Gross<br>Profit, Expenses, Net<br>Profit|PDF,<br>Excel|
|Top Selling Products|Date range, category|Product, Qty Sold,<br>Revenue, Rank|PDF,<br>Excel|



Page 32 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

|**Report**|**Filters**|**Key Columns**|**Export**|
|---|---|---|---|
|Slow Moving Products|Period, threshold|Product, Qty Sold, Days<br>Without Sale, Stock<br>Value|PDF,<br>Excel|
|Daily Report|Date|Sales, Purchases,<br>Expenses, Treasury<br>Open/Close, Net|PDF|
|Monthly Report|Month/Year|Summary by week, total<br>sales/purchases/profit|PDF,<br>Excel|
|Yearly Report|Year|Monthly summary with<br>charts|PDF,<br>Excel|



Page 33 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 16: Complete Screen List** 

## **16.1 Screen Inventory** 

|**#**|**Screen Name**|**Module**|**Access Level**|
|---|---|---|---|
|1|Setup Wizard|Auth|Public (first run only)|
|2|Login|Auth|Public|
|3|Dashboard|Dashboard|All roles|
|4|POS / New Sale|Sales|Admin, Manager, Cashier|
|5|Suspended Orders|Sales|Admin, Manager, Cashier|
|6|Sales History|Sales|Admin, Manager, Cashier<br>(own)|
|7|Invoice Detail|Sales|Admin, Manager, Cashier<br>(own)|
|8|Sales Return|Sales|Admin, Manager|
|9|Customer List|Customers|Admin, Manager, Cashier|
|1<br>0|Customer Form|Customers|Admin, Manager, Cashier|
|1<br>1|Customer Detail &<br>Statement|Customers|Admin, Manager, Accountant|
|1<br>2|Customer Payment|Customers|Admin, Manager, Accountant|
|1<br>3|Supplier List|Suppliers|Admin, Manager|
|1<br>4|Supplier Form|Suppliers|Admin, Manager|
|1<br>5|Supplier Detail & Statement|Suppliers|Admin, Manager, Accountant|
|1<br>6|Supplier Payment|Suppliers|Admin, Manager, Accountant|
|1<br>7|Purchase Invoice Form|Purchases|Admin, Manager, Inventory<br>Staff|
|1<br>8|Purchase History|Purchases|Admin, Manager, Inventory<br>Staff|
|1<br>9|Purchase Detail|Purchases|Admin, Manager, Inventory<br>Staff|
|2<br>0|Purchase Return|Purchases|Admin, Manager|
|2|Product List|Inventory|Admin, Manager, Inventory|



Page 34 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

|**#**|**Screen Name**|**Module**|**Access Level**|
|---|---|---|---|
|1|||Staff|
|2<br>2|Product Form|Inventory|Admin, Manager, Inventory<br>Staff|
|2<br>3|Product Detail & Variants|Inventory|Admin, Manager, Inventory<br>Staff|
|2<br>4|Category Management|Inventory|Admin, Manager|
|2<br>5|Brand Management|Inventory|Admin, Manager|
|2<br>6|Color Management|Inventory|Admin, Manager|
|2<br>7|Size Management|Inventory|Admin, Manager|
|2<br>8|Warehouse List|Inventory|Admin, Manager|
|2<br>9|Warehouse Form|Inventory|Admin|
|3<br>0|Warehouse Stock View|Inventory|Admin, Manager, Inventory<br>Staff|
|3<br>1|Inventory Movement History|Inventory|Admin, Manager, Inventory<br>Staff|
|3<br>2|Inventory Adjustments|Inventory|Admin, Manager, Inventory<br>Staff|
|3<br>3|Warehouse Transfers|Inventory|Admin, Manager, Inventory<br>Staff|
|3<br>4|Stock Count|Inventory|Admin, Manager, Inventory<br>Staff|
|3<br>5|Barcode Management|Inventory|Admin, Manager, Inventory<br>Staff|
|3<br>6|Expenses List|Finance|Admin, Manager, Accountant|
|3<br>7|New Expense|Finance|Admin, Manager, Accountant|
|3<br>8|Expense Categories|Finance|Admin, Manager|
|3<br>9|Employee List|Finance|Admin, Manager|
|4<br>0|Employee Form|Finance|Admin|



Page 35 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

|**#**|**Screen Name**|**Module**|**Access Level**|
|---|---|---|---|
|4<br>1|Salary Management|Finance|Admin, Manager, Accountant|
|4<br>2|Salary Payment|Finance|Admin, Manager, Accountant|
|4<br>3|Owner Withdrawals|Finance|Admin|
|4<br>4|Capital Deposits|Finance|Admin|
|4<br>5|Treasury Overview|Treasury|Admin, Manager, Accountant|
|4<br>6|Treasury Session|Treasury|Admin, Manager, Cashier|
|4<br>7|Treasury History|Treasury|Admin, Manager, Accountant|
|4<br>8|Reports Hub|Reports|Role-based|
|4<br>9|Each Report Screen (19<br>reports)|Reports|Role-based|
|5<br>0|User List|Users|Admin|
|5<br>1|User Form|Users|Admin|
|5<br>2|Role Management|Users|Admin|
|5<br>3|Audit Log Viewer|Users|Admin|
|5<br>4|Notifications|Notifications|All roles|
|5<br>5|Store Settings|Settings|Admin|
|5<br>6|Printer Settings|Settings|Admin, Manager|
|5<br>7|Payment Methods Settings|Settings|Admin|
|5<br>8|Invoice Numbering Settings|Settings|Admin|
|5<br>9|Backup & Restore|Settings|Admin|



Page 36 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 17: Technical Architecture** 

## **17.1 Technology Stack Recommendation** 

|**Layer**|**Technology**|**Version**|**Rationale**|
|---|---|---|---|
|Frontend Framework|Next.js (React)|14+|SSR for<br>performance, App<br>Router, excellent<br>RTL support|
|UI Components|shadcn/ui + Tailwind<br>CSS|Latest|Headless<br>components, easy<br>RTL with dir="rtl"|
|RTL Support|Built-in HTML dir="rtl"|N/A|All Tailwind classes<br>have RTL variants|
|Arabic Font|IBM Plex Arabic or Cairo|N/A|Excellent Arabic<br>readability|
|State Management|Zustand + React Query|Latest|Server state + client<br>state separation|
|Barcode Scanning|quagga2 or ZXing|Latest|Camera + USB<br>scanner support|
|Barcode Generation|JsBarcode|Latest|Generate EAN-13,<br>Code128, QR<br>codes|
|Printing|react-to-print +<br>ESC/POS|Latest|Browser print +<br>thermal printer<br>direct|
|Charts|Recharts or ApexCharts|Latest|RTL-compatible<br>chart library|
|Backend Framework|Node.js + Express or<br>Fastify|20+|High performance,<br>large ecosystem|
|API Validation|Zod|Latest|Runtime type safety|
|ORM|Prisma|Latest|Type-safe, excellent<br>migration tooling|
|Database|PostgreSQL|15+|ACID, JSONB, full-<br>text search|
|Caching|Redis|7+|Sessions, real-time<br>data, queues|
|File Storage|AWS S3 or MinIO|Latest|Scalable blob<br>storage|
|Task Queue|BullMQ|Latest|Async jobs (reports,<br>notifications)|



Page 37 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

|**Layer**|**Technology**|**Version**|**Rationale**|
|---|---|---|---|
|Containerization|Docker + Docker<br>Compose|Latest|Consistent<br>deployments|



## **17.2 Application Architecture** 

The system follows a layered architecture: 

|**Layer**|**Responsibility**|**Components**|
|---|---|---|
|Presentation|UI rendering, user<br>interaction|Next.js pages, React components,<br>Arabic RTL layout|
|API Gateway|Request routing, auth, rate<br>limiting|Express middleware, JWT validation,<br>StoreId injection|
|Business Logic|Domain rules, transaction<br>orchestration|Service classes, use cases, domain<br>events|
|Data Access|Database queries, caching|Prisma repositories, Redis cache layer|
|Infrastructure|External services, I/O|File storage, email, print queue,<br>notifications|



## **17.3 RTL UI Architecture** 

- All HTML elements rendered with dir="rtl" and lang="ar" 

- Tailwind CSS RTL plugin enables automatic start/end padding and margin RTL flip 

- Arabic font (Cairo or IBM Plex Arabic) loaded as primary font 

- All labels, placeholders, error messages in Arabic 

- Receipt and invoice templates in Arabic with RTL layout 

- Date format: DD/MM/YYYY (Arabic numeral option available) 

- Number format: Arabic or Western numerals based on store setting 

## **17.4 Printing Architecture** 

|**Print Type**|**Method**|**Format**|
|---|---|---|
|58mm Thermal Receipt|ESC/POS commands via<br>WebUSB or network printer|RTL Arabic text, product<br>list, total, barcode|
|80mm Thermal Receipt|ESC/POS commands via<br>WebUSB or network printer|Same as 58mm with<br>wider layout|
|A4 Reports / Invoices|Browser print dialog (CSS print<br>media)|Full Arabic formatted<br>document|
|Customer Statement|PDF generated server-side +<br>browser download|Arabic PDF with RTL<br>layout|



Page 38 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 18: Notifications & Alerts** 

## **18.1 Notification Types** 

|**Notification**|**Trigger Condition**|**Recipients**|**Frequenc**<br>**y**|
|---|---|---|---|
|Low Stock Alert|Product quantity <=<br>ReorderPoint|Admin, Manager,<br>Inventory Staff|Real-time<br>on each<br>sale|
|Negative Treasury|Treasury account balance<br>< 0|Admin, Manager|Immediat<br>e|
|Customer Debt Due|Customer balance > 0 and<br>due date passed|Admin, Manager,<br>Accountant|Daily at 9<br>AM|
|Supplier Debt Due|Supplier balance > 0 and<br>due date passed|Admin, Manager,<br>Accountant|Daily at 9<br>AM|
|Backup Failure|Scheduled backup fails|Admin|Immediat<br>e|
|Daily Summary|End of day report|Admin, Manager|Daily at<br>10 PM|



## **18.2 Notification Delivery** 

- In-app notification bell with unread count badge 

- Notifications stored in database per user 

- Real-time delivery via WebSocket or Server-Sent Events 

- Email notifications (optional, if email configured) 

Page 39 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 19: Business Rules** 

## **19.1 Sales Rules** 

42. A sale can be completed without a customer (walk-in cash sale) 

43. A sale with a customer can be cash, card, or credit 

44. Credit sales require: customer selected + credit limit sufficient 

45. Partial payment allowed only if customer account exists 

46. Change due is calculated only for cash payment portion 

47. Cannot complete sale if any item quantity > available stock 

48. Cannot void/delete a completed invoice; must use returns process 

49. Discounts cannot reduce item price below cost price (configurable) 

## **19.2 Inventory Rules** 

50. Inventory quantities are NEVER modified directly 

51. Every inventory change creates an InventoryMovement record 

52. Stock cannot go negative (configurable — some stores allow backorders) 

53. Transfers must be confirmed at destination before inventory increases 

54. Stock count corrections require manager approval 

55. Deleted products are soft-deleted; their history is preserved 

## **19.3 Financial Rules** 

56. Every money movement creates a TreasuryTransaction (no exceptions) 

57. Every financial event creates double-entry AccountingTransaction lines 

58. Treasury balance can never be negative (configurable) 

59. Daily sessions must be opened before any cash transaction 

60. Closed sessions cannot be modified 

61. Expense recording requires category and date 

62. Owner withdrawals reduce cash and equity simultaneously 

## **19.4 User & Security Rules** 

63. Only Admin can create or modify user accounts 

64. Only Admin can change user roles 

65. Every CRUD action on financial data is audit-logged 

66. Passwords must be minimum 8 characters 

Page 40 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

67. Sessions expire after 15 minutes of inactivity (configurable) 

68. Deleted users are soft-deleted; their historical records are preserved 

Page 41 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 20: Recommended Development Order** 

## **20.1 Phase 1 — Foundation (Weeks 1–4)** 

- Database schema design and migrations 

- Multi-tenant middleware and StoreId injection 

- Authentication: JWT, login, refresh tokens 

- Setup Wizard implementation 

- Base UI layout with Arabic RTL support 

- User management and RBAC 

## **20.2 Phase 2 — Core Inventory (Weeks 5–8)** 

- Product, variant, category, brand, color, size management 

- Warehouse management 

- Inventory items and movement tracking 

- Barcode generation and scanning 

- Product search with full-text Arabic search 

## **20.3 Phase 3 — Sales (Weeks 9–12)** 

- POS screen with barcode scanner integration 

- Cart management and product search 

- Payment methods and invoice creation 

- Customer module (optional customer selection) 

- Receipt printing (58mm and 80mm) 

- Sales history and invoice detail 

- Sales returns (full and partial) 

- Suspended orders 

## **20.4 Phase 4 — Purchasing & Suppliers (Weeks 13–15)** 

- Supplier management 

- Purchase invoice creation 

- Purchase returns 

- Supplier payments and statement 

Page 42 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **20.5 Phase 5 — Finance & Treasury (Weeks 16–18)** 

- Treasury accounts and sessions 

- Treasury transaction recording for all modules 

- Expense management 

- Employee and payroll management 

- Owner withdrawals and capital deposits 

- Chart of accounts and automatic journal entries 

## **20.6 Phase 6 — Reports & Dashboard (Weeks 19–21)** 

- Dashboard KPIs and charts 

- All 19 reports with filters and export 

- Profit & Loss statement 

- Customer and supplier aging reports 

## **20.7 Phase 7 — Polish & Advanced (Weeks 22–24)** 

- Notifications system 

- Audit log viewer 

- Advanced inventory: stock counts, transfers, adjustments 

- Settings and configuration module 

- Backup and restore 

- Performance optimization and load testing 

- Security audit and penetration testing 

## **20.8 Team Requirements** 

|**Role**|**Count**|**Responsibility**|
|---|---|---|
|Backend Developer|2|API, database, business logic, treasury,<br>accounting|
|Frontend Developer|2|React/Next.js, POS UI, RTL, Arabic UI,<br>printing|
|Full-Stack Developer|1|Reports, dashboard, integrations|
|UI/UX Designer|1|Arabic UI design, POS workflow, print<br>templates|
|QA Engineer|1|Testing all modules, regression, performance|
|DevOps / Architect|1|Infrastructure, CI/CD, database, deployment|



Page 43 of 44 

SRS & Technical Blueprint — Multi-Tenant SaaS POS System for Shoes Store **|    CONFIDENTIAL** 

## **Section 21: Future Scalability** 

## **21.1 Architecture Scalability** 

|**Concern**|**Current Design**|**Scale Path**|
|---|---|---|
|Database|Single PostgreSQL<br>instance|Read replicas → Connection pooling<br>(PgBouncer) → Sharding by StoreId|
|API|Monolithic Node.js|Horizontal scaling behind load<br>balancer → Extract high-load<br>services (sales, reports)|
|File Storage|S3-compatible|Already scales infinitely|
|Cache|Single Redis|Redis Cluster when needed|
|Real-time|WebSockets|Redis Pub/Sub for multi-instance<br>coordination|
|Search|PostgreSQL FTS|Elasticsearch if product catalog<br>exceeds 100K items|



## **21.2 Feature Roadmap (Future Versions)** 

|**Feature**|**Priority**|**Notes**|
|---|---|---|
|Multi-currency support|Medium|For stores dealing with foreign<br>suppliers|
|E-commerce integration|Low|Sync inventory with online store|
|Native mobile app|Medium|React Native for cashier on<br>tablet/phone|
|Online backup to cloud|High|Automated daily encrypted backups|
|WhatsApp invoice sharing|Medium|Send PDF invoice to customer via<br>WhatsApp|
|SMS customer notifications|Low|Debt reminders, promotions|
|Multi-branch support|High|Multiple stores under one account<br>with consolidated reporting|
|Supplier portal|Low|Suppliers view their invoices and<br>statements online|
|Integration with payment<br>gateways|Medium|Real Visa/InstaPay reconciliation|



Page 44 of 44 

