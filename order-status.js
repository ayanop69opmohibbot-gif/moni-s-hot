/* Shared order-status clock.
   30 minutes after an order is placed it automatically becomes "Delivered"
   (this is what the admin panel shows). Cancelled orders never change, and a
   status the admin already moved further ahead is never pushed back. */
(function () {
    var DELIVERY_MS = 30 * 60 * 1000;
    var FLOW = ["Order Placed", "Preparing", "Out for Delivery", "Delivered"];

    function stageFor(elapsed) {
        if (elapsed >= DELIVERY_MS) return "Delivered";
        if (elapsed >= 14 * 60 * 1000) return "Out for Delivery";
        if (elapsed >= 7 * 60 * 1000) return "Preparing";
        return "Order Placed";
    }

    function advance(order) {
        if (!order || !order.startTime) return false;
        var cur = order.status || "Order Placed";
        if (cur === "Cancelled" || cur === "Delivered") return false;
        var next = stageFor(Date.now() - order.startTime);
        if (FLOW.indexOf(next) > FLOW.indexOf(cur)) { order.status = next; return true; }
        return false;
    }

    function read(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }

    // Updates every saved order (and the customer's current order). Returns true if anything changed.
    window.syncOrderStatuses = function () {
        var changed = false;
        var list = read("orders");
        if (Array.isArray(list)) {
            list.forEach(function (o) { if (advance(o)) changed = true; });
            if (changed) localStorage.setItem("orders", JSON.stringify(list));
        }
        var cur = read("order");
        if (cur && advance(cur)) localStorage.setItem("order", JSON.stringify(cur));
        return changed;
    };

    // Customer cancels -> admin sees "Cancelled"
    window.markOrderCancelled = function (orderId) {
        if (window.Store && Store.mode === "server") { Store.cancelOrder(orderId).catch(function(){}); }
        var list = read("orders");
        if (!Array.isArray(list)) return;
        list.forEach(function (o) { if (o.orderId == orderId && o.status !== "Delivered") o.status = "Cancelled"; });
        localStorage.setItem("orders", JSON.stringify(list));
    };

    window.syncOrderStatuses();
    setInterval(window.syncOrderStatuses, 5000);
})();
