-- rls_role_defaults() (defined in add_rls_identity_helpers.sql, now updated in place there too
-- for anyone reading it as documentation) had drifted badly out of sync with
-- src/lib/permissions.ts's ROLE_DEFAULTS: it only ever had the original 18 permission keys,
-- while the app has since grown to 38. has_perm(flag) looks up
-- `rls_role_defaults() -> current_role_name() ->> flag`, so for every one of those 20 newer
-- flags (manageExpenses, voidSales, viewFinancialReports, adjustStock, ...) the lookup returned
-- NULL and the final COALESCE(..., false) silently denied it for EVERY role, admin included —
-- any RLS policy gated on one of those newer flags was unenforceable from the DB side. This
-- re-runs the same CREATE OR REPLACE against the live database (editing the original migration
-- file alone doesn't re-apply it) with a byte-for-byte resync generated from ROLE_DEFAULTS
-- itself, not hand-typed — no flag here is new, only completed.
CREATE OR REPLACE FUNCTION public.rls_role_defaults() RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT '{
    "admin": {
      "addOrder": true, "deleteOrder": true, "editOrder": true, "managePayments": true,
      "editMeasurements": true, "changeStage": true, "viewReports": true,
      "manageCustomers": true, "manageUsers": true, "deleteCustomers": true,
      "manageInventory": true, "managePurchases": true, "manageManufacturing": true,
      "manageSales": true, "useChatbot": true, "manageEmployees": true, "usePOS": true,
      "managePayroll": true, "manageExpenses": true, "voidSales": true,
      "manageCreditNotes": true, "cancelPurchases": true, "payVendors": true,
      "adjustStock": true, "transferStock": true, "deleteInventory": true,
      "approveLeave": true, "viewFinancialReports": true, "manageWhatsappSettings": true,
      "manageLoyaltySettings": true, "manageDocumentTemplates": true, "managePriceLists": true,
      "manageNavigationSettings": true, "viewActivityLog": true, "useCostEstimator": true,
      "backdateOrders": true, "awardLoyaltyPoints": true, "sendWhatsappBroadcast": true,
      "closeRegister": true
    },
    "manager": {
      "addOrder": true, "deleteOrder": false, "editOrder": true, "managePayments": true,
      "editMeasurements": true, "changeStage": true, "viewReports": true,
      "manageCustomers": true, "manageUsers": false, "deleteCustomers": false,
      "manageInventory": true, "managePurchases": true, "manageManufacturing": true,
      "manageSales": true, "useChatbot": true, "manageEmployees": true, "usePOS": true,
      "managePayroll": false, "manageExpenses": true, "voidSales": false,
      "manageCreditNotes": true, "cancelPurchases": false, "payVendors": true,
      "adjustStock": true, "transferStock": true, "deleteInventory": false,
      "approveLeave": true, "viewFinancialReports": false, "manageWhatsappSettings": false,
      "manageLoyaltySettings": false, "manageDocumentTemplates": false, "managePriceLists": false,
      "manageNavigationSettings": false, "viewActivityLog": true, "useCostEstimator": true,
      "backdateOrders": true, "awardLoyaltyPoints": true, "sendWhatsappBroadcast": true,
      "closeRegister": true
    },
    "sales": {
      "addOrder": true, "deleteOrder": false, "editOrder": true, "managePayments": false,
      "editMeasurements": true, "changeStage": true, "viewReports": false,
      "manageCustomers": true, "manageUsers": false, "deleteCustomers": false,
      "manageInventory": false, "managePurchases": false, "manageManufacturing": false,
      "manageSales": true, "useChatbot": false, "manageEmployees": false, "usePOS": true,
      "managePayroll": false, "manageExpenses": false, "voidSales": false,
      "manageCreditNotes": false, "cancelPurchases": false, "payVendors": false,
      "adjustStock": false, "transferStock": false, "deleteInventory": false,
      "approveLeave": false, "viewFinancialReports": false, "manageWhatsappSettings": false,
      "manageLoyaltySettings": false, "manageDocumentTemplates": false, "managePriceLists": false,
      "manageNavigationSettings": false, "viewActivityLog": false, "useCostEstimator": false,
      "backdateOrders": false, "awardLoyaltyPoints": false, "sendWhatsappBroadcast": false,
      "closeRegister": false
    },
    "tailor": {
      "addOrder": false, "deleteOrder": false, "editOrder": false, "managePayments": false,
      "editMeasurements": false, "changeStage": true, "viewReports": false,
      "manageCustomers": false, "manageUsers": false, "deleteCustomers": false,
      "manageInventory": false, "managePurchases": false, "manageManufacturing": true,
      "manageSales": false, "useChatbot": false, "manageEmployees": false, "usePOS": false,
      "managePayroll": false, "manageExpenses": false, "voidSales": false,
      "manageCreditNotes": false, "cancelPurchases": false, "payVendors": false,
      "adjustStock": false, "transferStock": false, "deleteInventory": false,
      "approveLeave": false, "viewFinancialReports": false, "manageWhatsappSettings": false,
      "manageLoyaltySettings": false, "manageDocumentTemplates": false, "managePriceLists": false,
      "manageNavigationSettings": false, "viewActivityLog": false, "useCostEstimator": false,
      "backdateOrders": false, "awardLoyaltyPoints": false, "sendWhatsappBroadcast": false,
      "closeRegister": false
    }
  }'::jsonb;
$fn$;
