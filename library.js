'use strict';

const nconf = require.main.require('nconf');
const winston = require.main.require('winston');
const controllers = require('./lib/controllers');

const plugin = {};

plugin.init = async (params) => {
	const { router, middleware/* , controllers */ } = params;
	const routeHelpers = require.main.require('./src/routes/helpers');

	/**
	 * We create two routes for every view. One API call, and the actual route itself.
	 * Use the `setupPageRoute` helper and NodeBB will take care of everything for you.
	 *
	 * Other helpers include `setupAdminPageRoute` and `setupAPIRoute`
	 * */
	routeHelpers.setupPageRoute(router, '/quickstart', middleware, [(req, res, next) => {
		winston.info(`[plugins/quickstart] In middleware. This argument can be either a single middleware or an array of middlewares`);
		setImmediate(next);
	}], (req, res) => {
		winston.info(`[plugins/quickstart] Navigated to ${nconf.get('relative_path')}/quickstart`);
		res.sendStatus(200);	// replace this with res.render('templateName');
	});
	routeHelpers.setupAdminPageRoute(router, '/admin/plugins/quickstart', middleware, [], controllers.renderAdminPage);
};

/**
 * If you wish to add routes to NodeBB's RESTful API, listen to the `static:api.routes` hook.
 * Define your routes similarly to above, and allow core to handle the response via the
 * built-in helpers.formatApiResponse() method.
 *
 * In this example route, the `authenticate` middleware is added, which means a valid login
 * session or bearer token (which you can create via ACP > Settings > API Access) needs to be
 * passed in.
 *
 * To call this example route:
 *   curl -X GET \
 * 		http://example.org/api/v3/plugins/foobar/test \
 * 		-H "Authorization: Bearer some_valid_bearer_token"
 *
 * Will yield the following response JSON:
 * 	{
 *		"status": {
 *			"code": "ok",
 *			"message": "OK"
 *		},
 *		"response": {
 *			"foobar": "test"
 *		}
 *	}
 */
plugin.addRoutes = async ({ router, middleware, helpers }) => {
	router.get('/quickstart/:param1', middleware.authenticate, (req, res) => {
		helpers.formatApiResponse(200, res, {
			foobar: req.params.param1,
		});
	});
};

plugin.addAdminNavigation = function (header, callback) {
	header.plugins.push({
		route: '/plugins/quickstart',
		icon: 'fa-tint',
		name: 'Quickstart',
	});

	callback(null, header);
};

module.exports = plugin;
