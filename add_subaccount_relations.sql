-- Add sub_debit_id and sub_credit_id columns to transaction table
ALTER TABLE `transaction` 
ADD COLUMN `sub_debit_id` INTEGER NULL,
ADD COLUMN `sub_credit_id` INTEGER NULL;

-- Add foreign key constraints
ALTER TABLE `transaction` 
ADD CONSTRAINT `transaction_sub_debit_id_fkey` 
FOREIGN KEY (`sub_debit_id`) REFERENCES `subAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `transaction` 
ADD CONSTRAINT `transaction_sub_credit_id_fkey` 
FOREIGN KEY (`sub_credit_id`) REFERENCES `subAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Create indexes for the new columns
CREATE INDEX `transaction_sub_debit_id_fkey` ON `transaction`(`sub_debit_id`);
CREATE INDEX `transaction_sub_credit_id_fkey` ON `transaction`(`sub_credit_id`);

