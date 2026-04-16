// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {CategoryRegistry} from "../contracts/CategoryRegistry.sol";
import {ICategoryRegistry} from "../contracts/interfaces/ICategoryRegistry.sol";

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

    function test_AddApprovedCategory_StoresSeedOnlyMetadata() public {
        string[] memory subcategories = _subcategories("Quality", "Value");

        vm.prank(admin);
        uint256 categoryId = registry.addApprovedCategory("Products", " Product_Tools ", subcategories);

        ICategoryRegistry.Category memory category = registry.getCategory(categoryId);
        assertEq(category.id, categoryId);
        assertEq(category.name, "Products");
        assertEq(category.domain, "product-tools");
        assertEq(category.subcategories.length, 2);
        assertEq(category.subcategories[0], "Quality");
        assertEq(category.subcategories[1], "Value");
        assertEq(category.submitter, address(0));
        assertEq(category.stakeAmount, 0);
        assertEq(uint256(category.status), uint256(ICategoryRegistry.CategoryStatus.Approved));
        assertEq(category.proposalId, 0);
        assertTrue(category.createdAt > 0);

        assertTrue(registry.isApprovedCategory(categoryId));
        assertTrue(registry.isDomainRegistered("PRODUCT tools"));
        assertEq(registry.getCategoryByDomain("PRODUCT_tools").id, categoryId);
        assertEq(uint256(registry.getCategoryStatus(categoryId)), uint256(ICategoryRegistry.CategoryStatus.Approved));
        assertEq(registry.getSubcategories(categoryId).length, 2);
        assertEq(registry.nextCategoryId(), categoryId + 1);
    }

    function test_AddApprovedCategory_RevertsForDuplicateSlug() public {
        vm.startPrank(admin);
        registry.addApprovedCategory("Products", "products", _subcategories("Quality", "Value"));

        vm.expectRevert("Category already registered");
        registry.addApprovedCategory("Products 2", "Products", _subcategories("Quality", "Safety"));
        vm.stopPrank();
    }

    function test_AddApprovedCategory_RevertsForNonAdmin() public {
        vm.prank(user);
        vm.expectRevert();
        registry.addApprovedCategory("Products", "products", _subcategories("Quality", "Value"));
    }

    function test_AddApprovedCategory_RevertsForInvalidMetadata() public {
        vm.startPrank(admin);

        vm.expectRevert("Invalid name length");
        registry.addApprovedCategory("", "products", _subcategories("Quality", "Value"));

        vm.expectRevert("Empty slug after normalization");
        registry.addApprovedCategory("Products", "!!!", _subcategories("Quality", "Value"));

        vm.expectRevert("Invalid subcategories count");
        registry.addApprovedCategory("Products", "products", new string[](0));

        string[] memory tooManySubcategories = new string[](21);
        for (uint256 i = 0; i < tooManySubcategories.length; i++) {
            tooManySubcategories[i] = "Tag";
        }
        vm.expectRevert("Invalid subcategories count");
        registry.addApprovedCategory("Products", "products", tooManySubcategories);

        string[] memory invalidSubcategories = new string[](1);
        invalidSubcategories[0] = "";
        vm.expectRevert("Invalid subcategory length");
        registry.addApprovedCategory("Products", "products", invalidSubcategories);

        vm.stopPrank();
    }

    function test_GetApprovedCategoryIdsPaginated_ReturnsWindowAndTotal() public {
        vm.startPrank(admin);
        registry.addApprovedCategory("Products", "products", _subcategories("Quality", "Value"));
        registry.addApprovedCategory("Apps", "apps", _subcategories("Utility", "Trust"));
        registry.addApprovedCategory("General", "general", _subcategories("Clear", "Useful"));
        vm.stopPrank();

        (uint256[] memory ids, uint256 total) = registry.getApprovedCategoryIdsPaginated(1, 2);
        assertEq(total, 3);
        assertEq(ids.length, 2);
        assertEq(ids[0], 2);
        assertEq(ids[1], 3);

        (uint256[] memory emptyIds, uint256 emptyTotal) = registry.getApprovedCategoryIdsPaginated(3, 2);
        assertEq(emptyTotal, 3);
        assertEq(emptyIds.length, 0);
    }

    function test_GetCategory_RevertsForUnknownCategory() public {
        vm.expectRevert("Category does not exist");
        registry.getCategory(1);

        vm.expectRevert("Category not registered");
        registry.getCategoryByDomain("missing");
    }

    function _subcategories(string memory first, string memory second) internal pure returns (string[] memory values) {
        values = new string[](2);
        values[0] = first;
        values[1] = second;
    }
}
