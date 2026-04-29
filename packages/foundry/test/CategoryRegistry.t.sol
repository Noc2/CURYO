// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { CategoryRegistry } from "../contracts/CategoryRegistry.sol";
import { ICategoryRegistry } from "../contracts/interfaces/ICategoryRegistry.sol";

contract CategoryRegistryTest is Test {
    CategoryRegistry public registry;

    address public admin = address(1);
    address public governance = address(2);
    address public user = address(3);

    function setUp() public {
        vm.prank(admin);
        registry = new CategoryRegistry(admin, governance);
    }

    function test_ConstructorGrantsSeedRoles() public view {
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), governance));
        assertTrue(registry.hasRole(registry.ADMIN_ROLE(), governance));
        assertTrue(registry.hasRole(registry.ADMIN_ROLE(), admin));
        assertFalse(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
        assertEq(registry.nextCategoryId(), 1);
    }

    function test_AddCategory_StoresSeedOnlyMetadata() public {
        string[] memory subcategories = _subcategories("Quality", "Value");

        vm.prank(admin);
        uint256 categoryId = registry.addCategory("Products", " Product_Tools ", subcategories);

        ICategoryRegistry.Category memory category = registry.getCategory(categoryId);
        assertEq(category.id, categoryId);
        assertEq(category.name, "Products");
        assertEq(category.slug, "product-tools");
        assertEq(category.subcategories.length, 2);
        assertEq(category.subcategories[0], "Quality");
        assertEq(category.subcategories[1], "Value");
        assertTrue(category.createdAt > 0);

        assertTrue(registry.isCategory(categoryId));
        assertEq(registry.getCategoryBySlug("PRODUCT_tools").id, categoryId);
        assertEq(registry.nextCategoryId(), categoryId + 1);
    }

    function test_AddCategory_RevertsForDuplicateSlug() public {
        vm.startPrank(admin);
        registry.addCategory("Products", "products", _subcategories("Quality", "Value"));

        vm.expectRevert("Category already registered");
        registry.addCategory("Products 2", "Products", _subcategories("Quality", "Safety"));
        vm.stopPrank();
    }

    function test_AddCategory_RevertsForNonAdmin() public {
        vm.prank(user);
        vm.expectRevert();
        registry.addCategory("Products", "products", _subcategories("Quality", "Value"));
    }

    function test_AddCategory_RevertsForInvalidMetadata() public {
        vm.startPrank(admin);

        vm.expectRevert("Invalid name length");
        registry.addCategory("", "products", _subcategories("Quality", "Value"));

        vm.expectRevert("Empty slug after normalization");
        registry.addCategory("Products", "!!!", _subcategories("Quality", "Value"));

        vm.expectRevert("Invalid subcategories count");
        registry.addCategory("Products", "products", new string[](0));

        string[] memory tooManySubcategories = new string[](21);
        for (uint256 i = 0; i < tooManySubcategories.length; i++) {
            tooManySubcategories[i] = "Tag";
        }
        vm.expectRevert("Invalid subcategories count");
        registry.addCategory("Products", "products", tooManySubcategories);

        string[] memory invalidSubcategories = new string[](1);
        invalidSubcategories[0] = "";
        vm.expectRevert("Invalid subcategory length");
        registry.addCategory("Products", "products", invalidSubcategories);

        vm.stopPrank();
    }

    function test_GetCategoryIdsPaginated_ReturnsWindowAndTotal() public {
        vm.startPrank(admin);
        registry.addCategory("Products", "products", _subcategories("Quality", "Value"));
        registry.addCategory("Apps", "apps", _subcategories("Utility", "Trust"));
        registry.addCategory("General", "general", _subcategories("Clear", "Useful"));
        vm.stopPrank();

        (uint256[] memory ids, uint256 total) = registry.getCategoryIdsPaginated(1, 2);
        assertEq(total, 3);
        assertEq(ids.length, 2);
        assertEq(ids[0], 2);
        assertEq(ids[1], 3);

        (uint256[] memory emptyIds, uint256 emptyTotal) = registry.getCategoryIdsPaginated(3, 2);
        assertEq(emptyTotal, 3);
        assertEq(emptyIds.length, 0);
    }

    function test_GetCategory_RevertsForUnknownCategory() public {
        vm.expectRevert("Category does not exist");
        registry.getCategory(1);

        vm.expectRevert("Category not registered");
        registry.getCategoryBySlug("missing");
    }

    function _subcategories(string memory first, string memory second) internal pure returns (string[] memory values) {
        values = new string[](2);
        values[0] = first;
        values[1] = second;
    }
}
