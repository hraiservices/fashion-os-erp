-- inventory_ledger.item_id is a polymorphic reference — item_type decides whether it points
-- into raw_materials.id or products.id — so it was left with no FK at all (a plain REFERENCES
-- can only target one table). That means a typo'd or stale item_id inserts successfully and
-- silently corrupts the inventory_stock view (SUM(movement) GROUP BY item_type, item_id),
-- since it's summing movements for an item that doesn't exist. A trigger-based check gives the
-- same guarantee a real FK would: reject the insert/update outright if item_id doesn't exist
-- in the table item_type says it should.
CREATE OR REPLACE FUNCTION check_inventory_ledger_item_fk() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.item_type = 'raw_material' THEN
    IF NOT EXISTS (SELECT 1 FROM raw_materials WHERE id = NEW.item_id) THEN
      RAISE EXCEPTION 'inventory_ledger.item_id % does not exist in raw_materials', NEW.item_id;
    END IF;
  ELSIF NEW.item_type = 'product' THEN
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = NEW.item_id) THEN
      RAISE EXCEPTION 'inventory_ledger.item_id % does not exist in products', NEW.item_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_ledger_item_fk ON inventory_ledger;
CREATE TRIGGER trg_inventory_ledger_item_fk
  BEFORE INSERT OR UPDATE OF item_type, item_id ON inventory_ledger
  FOR EACH ROW EXECUTE FUNCTION check_inventory_ledger_item_fk();
