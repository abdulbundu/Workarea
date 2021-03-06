/**
 * @namespace WORKAREA.analytics
 * @property {boolean} debug
 * @property {object} events - a collection of events fired for the current page
 * @property {object} callbacks
 * @property {function} fireCallbacks
 * @property {function} registerAdapter
 * @property {function} disableDomEvents - allow tests to disable dom events
 */
WORKAREA.registerModule('analytics', (function () {
    'use strict';

    var debug = WORKAREA.environment.isDevelopment,

        handledEvents = [
            'productList',
            'productClick',
            'updateCartItem'
        ],

        handledDomEvents = [
            'submit'
        ],

        preventDomEvents = false,


        /**
         * Test Helpers
         */

        /**
         * Ceases the triggering of DOM events handled by the module, for
         * testing purposes.
         *
         * @method
         * @name disableDomEvents
         * @memberOf WORKAREA.analytics
         */
        disableDomEvents = function () {
            preventDomEvents = true;
        },

        domEventsDisabled = function () {
            return preventDomEvents;
        },


        /**
         * Adapter Management
         */

        events = [],
        callbacks = {},


        /**
         * Utility
         */

        analyticsDisabled = function () {
            return $('meta[property=analytics]').attr('content') === 'disable';
        },


        /**
         * @method
         * @name fireCallback
         * @memberof WORKAREA.analytics
         */
        fireCallback = function () {
            var name = arguments[0],
                callbackArgs = _.tail(arguments);

            if (analyticsDisabled()) { return; }

            if (debug && window.console) {
                window.console.log(
                    'WORKAREA.analytics: firing',
                    '"' + name + '" with arguments',
                    callbackArgs
                );
            }

            events.push({ name: name, arguments: callbackArgs});

            _.forEach(callbacks[name], function (callback) {
                callback.apply(callback, callbackArgs);
            });
        },

        /**
         * @method
         * @name registerAdapter
         * @memberof WORKAREA.analytics
         */
        registerAdapter = function (name, fn) {
            _.forEach(fn(), function (callback, event) {
                callbacks[event] = callbacks[event] || [];
                callbacks[event].push(callback);
            });
        },


        /**
         * Event Management
         */

        getBreadcrumbs = _.memoize(function () {
            return $('.breadcrumbs .breadcrumbs__node')
                .map(function () { return $.trim($(this).text()); })
                .get()
                .join('/');
        }),

        calculateListPosition = function (position, page, perPage) {
            position = position || 0;
            page = page || 1;
            perPage = perPage || 20;

            return position + ((page - 1) * perPage);
        },

        forEachAnalyticsElement = function ($scope, conditions, iterator) {
            function isConditionsMatch(data) {
                return (!conditions.event || conditions.event === data.event) &&
                    (!conditions.domEvent || conditions.domEvent === data.domEvent);
            }

            $scope
                .find('[data-analytics]')
                    .addBack('[data-analytics]')
                    .each(function () {
                        var data = $(this).data('analytics');

                        if (isConditionsMatch(data)) {
                            iterator.call(this, data);
                        }
                    });
        },

        setupProductClicks = _.partialRight(forEachAnalyticsElement, { 'event': 'productClick' }, function (data) {
            var $clickElement = $(this);

            $clickElement.on('click', function (event) {
                var $closestList = $clickElement.parents('[data-analytics]').filter(function () {
                        return $(this).data('analytics').event === 'productList';
                    }),

                    listData = $closestList.data('analytics') || {},

                    $allImpressions = $closestList.find('[data-analytics-product-impression]'),
                    $thisImpression = $clickElement
                                        .closest('.product-summary')
                                        .find('[data-analytics-product-impression]'),

                    position = calculateListPosition(
                        $allImpressions.index($thisImpression),
                        listData.page,
                        listData.per_page
                    ),

                    listName = listData.name || getBreadcrumbs();

                if (preventDomEvents) { event.preventDefault(); }

                WORKAREA.analytics.fireCallback(
                    'productClick',
                    _.merge(data.payload, { 'list': listName, 'position': position })
                );
            });
        }),

        setupFormSubmissions = _.partialRight(forEachAnalyticsElement, { 'domEvent': 'submit' }, function (data) {
            if(data.event === 'updateCartItem') { return; }

            var $form = $(this),
                addQuantityToPayload = function (form, data) {
                    if (data.event === 'addToCart') {
                        data.payload.quantity =
                            $('[name=quantity]', form).val();
                    }
                    return data;
                };

            $form.on('submit', function (event) {
                if (preventDomEvents) { event.preventDefault(); }

                if ($form.valid()) {
                    data = addQuantityToPayload(this, data);
                    WORKAREA.analytics.fireCallback(data.event, data.payload);
                }
            });
        }),

        // TODO This is also a form submission, so quantity data can be included
        // in setupFormSubmissions (see duplicate addToCart logic above)
        setupCartItemUpdates = _.partialRight(forEachAnalyticsElement, { 'event': 'updateCartItem' }, function (data) {
            var $form = $(this);

            $form.on('submit', function (event) {
                if (preventDomEvents) { event.preventDefault(); }

                if ($form.valid()) {
                    var newQuantity = $('input[name=quantity]', $form).val();

                    WORKAREA.analytics.fireCallback(
                        data.event,
                        _.merge(
                            data.payload,
                            { 'from': data.payload.quantity, 'to': newQuantity }
                        )
                    );
                }
            });
        }),

        setupProductLists = _.partialRight(forEachAnalyticsElement, { 'event': 'productList' }, function (data) {
            var $list = $(this),
                page = data.page,
                perPage = data.per_page,
                impressions = $list.find('[data-analytics-product-impression]').map(function (index) {
                    return _.assign(
                        $(this).data('analyticsProductImpression'),
                        { 'position': calculateListPosition(index, page, perPage) }
                    );
                }).get();

            if (_.isEmpty(impressions)) {
                return;
            }

            data.name = data.name || getBreadcrumbs();
            data.impressions = impressions;

            WORKAREA.analytics.fireCallback('productList', data);
        }),

        setupGenericCallbacks = _.partialRight(forEachAnalyticsElement, {}, function (data) {
            if (_.includes(handledEvents, data.event)) { return; }
            if (_.includes(handledDomEvents, data.domEvent)) { return; }

            if (data.domEvent) {
                $(this).on(data.domEvent, function (event) {
                    if (preventDomEvents) { event.preventDefault(); }

                    WORKAREA.analytics.fireCallback(data.event, data.payload);
                });
            } else {
                WORKAREA.analytics.fireCallback(data.event, data.payload);
            }
        }),

        firePageView = _.once(function () {
            WORKAREA.analytics.fireCallback('pageView');
        }),

        /**
         * @method
         * @name init
         * @memberof WORKAREA.analytics
         */
        init = function ($scope) {
            if (analyticsDisabled()) { return; }

            setupProductClicks($scope);
            setupCartItemUpdates($scope);
            setupFormSubmissions($scope);
            setupProductLists($scope);

            setupGenericCallbacks($scope);
            firePageView();
        };

    return {
        init: init,
        registerAdapter: registerAdapter,
        debug: debug,
        fireCallback: fireCallback,
        callbacks: callbacks,
        disableDomEvents: disableDomEvents,
        domEventsDisabled: domEventsDisabled,
        events: events
    };
}()));
