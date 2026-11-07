// Default shop data (used the first time the site runs, and by "Reset to defaults" in the admin panel).
// Works in the browser (global SEED) and in Node (require).
(function (root) {
    var SEED = {
        categories: [
            { name: "beef",    image: "beef c  image 2.jpeg" },
            { name: "Chicken", image: "for c 1.jpeg" },
            { name: "kabab",   image: "kabab c image 3.jpeg" }
        ],
        products: [
            { id: "p1", title: "Beef Behari Boti", category: "beef", peice: 899, Image: "beef b boti.jpeg", bestSeller: true, available: true,
              description: "Melt in mouth pieces of beef marinated in spices and barbecued to perfection on charcoal grill." },
            { id: "p2", title: "Chicken Behari Boti", category: "Chicken", peice: 899, Image: "chicken b boti.jpeg", bestSeller: true, available: true,
              description: "Melt in mouth pieces of chicken marinated in spices and barbecued to perfection on charcoal grill." },
            { id: "p3", title: "Chicken Malai Boti", category: "Chicken", peice: 799, Image: "malai boti.jpeg", bestSeller: true, available: true,
              description: "Boneless Chicken piece marinated in a creamy based marination, cooked to perfection." },
            { id: "p4", title: "Chicken Cheese Kabab", category: "kabab", peice: 699, Image: "kabab 1.jpeg", bestSeller: false, available: true,
              description: "Minced chicken kabab with tinch of spices along with oozing cheese, cooked over live charcoals." },
            { id: "p5", title: "Seekh Kabab (Beef)", category: "kabab", peice: 699, Image: "kabab 2.jpeg", bestSeller: false, available: true,
              description: "Minced Beef kebabs marinated in green chilies, onion and coriander, cooked over live charcoals." }
        ],
        // pictures offered in the admin "image library" when the server is not running
        images: ["beef b boti.jpeg", "chicken b boti.jpeg", "malai boti.jpeg", "kabab 1.jpeg", "kabab 2.jpeg",
                 "tikka.jpeg", "tikka.webp", "bbq2.jpeg", "beef c  image 2.jpeg", "for c 1.jpeg", "kabab c image 3.jpeg"]
    };
    if (typeof module !== "undefined" && module.exports) module.exports = SEED; else root.SEED = SEED;
})(this);
