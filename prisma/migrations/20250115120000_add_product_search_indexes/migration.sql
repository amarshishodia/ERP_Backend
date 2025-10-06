-- CreateIndex
CREATE INDEX `product_name_idx` ON `product`(`name`);

-- CreateIndex
CREATE INDEX `product_author_idx` ON `product`(`author`);

-- CreateIndex
CREATE INDEX `product_isbn_idx` ON `product`(`isbn`);

-- CreateIndex
CREATE INDEX `product_sku_idx` ON `product`(`sku`(100));

-- CreateIndex
CREATE INDEX `product_status_idx` ON `product`(`status`);

-- CreateIndex
CREATE INDEX `book_publisher_name_idx` ON `book_publisher`(`name`);
