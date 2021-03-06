/**
 * dynamodb-atomic-counter - (c) 2015 Sergio Alcantara
 * Generates unique identifiers using DynamoDB atomic counter update operations.
 * 
 * @author Sergio Alcantara
 */

	/**
	 * Default name of the DynamoDB table where the atomic counters will be stored.
	 */
var DEFAULT_TABLE_NAME = 'AtomicCounters',
	/**
	 * Default attribute name that will identify each counter.
	 */
	DEFAULT_KEY_ATTRIBUTE = 'id',
	/**
	 * Default attribute name of the count value attribute.
	 * The count attribute indicates the "last value" used in the last increment operation.
	 */
	DEFAULT_COUNT_ATTRIBUTE = 'lastValue',
	/**
	 * Default increment value.
	 */
	DEFAULT_INCREMENT = 1;

var dynamo,
	AWS = require( 'aws-sdk' ),
	_ = require( 'underscore' );

_.mixin( require('underscore.deferred') );


/**
 * A convinience "no operation" function.
 */
var noop = function(){};

/**
 * Make the `AWS.DynamoDB.config` method available.
 */
exports.config = AWS.config;

/**
 * Increments the counter for the specified `counterId`.
 * It returns an AWS-SDK request instance with a jQuery style promise interface applied to it.
 * See [jQuery documentation](http://api.jquery.com/category/deferred-object/) to find out how to attach callbacks
 * to the returned object using the methods: done, fail, always, and then.
 *
 * @method increment
 * @param {String} counterId The name or identifier of the counter to increment.
 * @param {Object} options An options object to overwrite some of the default behaviour of the increment operation.
 * @param {String} options.tableName The name of the DynamoDB table that stores the counters. If not specified, it uses "AtomicCounters" by default.
 * @param {String} options.keyAttribute The name of the attribute that stores the counter name/identifier. If not specified, it uses "id" by default.
 * @param {String} options.countAttribute The name of the attribute that stores the last value generated for the specified `counterId`.
 *    If not specified, it uses "lastValue" by default.
 * @param {Integer} options.increment Specifies by how much the counter should be incremented. If not specified, it uses 1 by default.
 * @param {Function} options.success Success callback function. It receives a single argument: the value (integer) generated by this
 *    increment operation for the specified `counterId`.
 * @param {Function} options.error Error callback function. If the DynamoDB UpdateItem request fails, the error callback is executed.
 *    It receives a single argument: the error object returned from AWS-SDK.
 * @param {Function} options.complete Complete callback function. This callback is executed when the increment operation is completed,
 *    whether or not it was successful. It receives a single argument: a number, if the operation was successful, or an error object if it failed.
 * @param options.context The context object to use in all callbacks. If specified, the value of `this`
 *    within all callbacks will be `options.context`.
 * @param {Object} options.dynamodb Additional DynamoDB parameters. These parameters will be added to the parameters sent in the
 *    [update item](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#updateItem-property) request.
 * @return {Request} A DynamoDB UpdateItem [request](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Request.html) object,
 *    with a [jQuery](http://api.jquery.com/category/deferred-object/) style promise interface applied to it.
 */
exports.increment = function ( counterId, options ) {
	options || ( options = {} );

	var request,
		deferred = new _.Deferred(),
		params = {
			Key: {},
			AttributeUpdates: {},
			ReturnValues: 'UPDATED_NEW',
			TableName: options.tableName || DEFAULT_TABLE_NAME
		},
		keyAttribute = options.keyAttribute || DEFAULT_KEY_ATTRIBUTE,
		countAttribute = options.countAttribute || DEFAULT_COUNT_ATTRIBUTE,
		errorFn = _.isFunction( options.error ) ? options.error : noop,
		successFn = _.isFunction( options.success ) ? options.success : noop,
		completeFn = _.isFunction( options.complete ) ? options.complete : noop;

	params.Key[ keyAttribute ] = { S: counterId };
	params.AttributeUpdates[ countAttribute ] = {
		Action: 'ADD',
		Value: {
			N: '' + ( options.increment || DEFAULT_INCREMENT )
		}
	};
	_.extend( params, options.dynamodb );

	dynamo || ( dynamo = new AWS.DynamoDB() );

	request = dynamo.updateItem(params, function (error, data) {
		var newCountValue;

		try {
			if ( error ) {
				throw error;
			}

			// Try to parse the count value. An exception will be thrown if it's not a valid number.
			newCountValue = parseInt( data.Attributes[ countAttribute ].N, 10 );

			if ( !_.isNumber( newCountValue ) || _.isNaN( newCountValue ) ) {
				throw 'Could not parse incremented value (' + newCountValue + ').';
			}
		} catch ( e ) {
			if ( options.context ) {
				deferred.rejectWith( options.context, [ e ] );
			} else {
				deferred.reject( e );
			}

			return;
		}

		if ( options.context ) {
			deferred.resolveWith( options.context, [ newCountValue ] );
		} else {
			deferred.resolve( newCountValue );
		}
	});

	/**
	 * Apply a promise interface to `request`, set the success, error, and complete callback, and return the promise.
	 */
	return deferred.promise( request ).done( successFn ).fail( errorFn ).always( completeFn );
};

/**
 * Gets the last value previously generated for the specified `counterId`.
 * It returns an AWS-SDK request instance with a jQuery style promise interface applied to it.
 * See [jQuery documentation](http://api.jquery.com/category/deferred-object/) to find out how to attach callbacks
 * to the returned object using the methods: done, fail, always, and then.
 *
 * @method getLastValue
 * @param {String} counterId The name or identifier of the counter.
 * @param {Object} options An options object to overwrite some of the default options.
 * @param {String} options.tableName The name of the DynamoDB table that stores the counters. If not specified, it uses "AtomicCounters" by default.
 * @param {String} options.keyAttribute The name of the attribute that stores the counter name/identifier. If not specified, it uses "id" by default.
 * @param {String} options.countAttribute The name of the attribute that stores the last value generated for the specified `counterId`.
 *    If not specified, it uses "lastValue" by default.
 * @param {Function} options.success Success callback function. It receives a single argument: the last value (integer) previously generated
 *    for the specified `counterId`.
 * @param {Function} options.error Error callback function. If the DynamoDB GetItem request fails, the error callback is executed.
 *    It receives a single argument: the error object returned from AWS-SDK or the exception thrown when attempting to parse the response.
 * @param {Function} options.complete Complete callback function. This callback is executed when the GetItem request is completed,
 *    whether or not it was successful. It receives a single argument: a number, if it was successful, or an error object if it failed.
 * @param options.context The context object to use in all callbacks. If specified, the value of `this`
 *    within all callbacks will be `options.context`.
 * @param {Object} options.dynamodb Additional DynamoDB parameters. These parameters will be added to the parameters sent in the
 *    [get item](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#getItem-property) request.
 * @return {Request} A DynamoDB GetItem [request](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Request.html) object,
 *    with a [jQuery](http://api.jquery.com/category/deferred-object/) style promise interface applied to it.
 */
exports.getLastValue = function ( counterId, options ) {
	options || ( options = {} );

	var request,
		deferred = new _.Deferred(),
		keyAttribute = options.keyAttribute || DEFAULT_KEY_ATTRIBUTE,
		countAttribute = options.countAttribute || DEFAULT_COUNT_ATTRIBUTE,
		params = {
			Key: {},
			AttributesToGet: [ countAttribute ],
			TableName: options.tableName || DEFAULT_TABLE_NAME
		},
		errorFn = _.isFunction( options.error ) ? options.error : noop,
		successFn = _.isFunction( options.success ) ? options.success : noop,
		completeFn = _.isFunction( options.complete ) ? options.complete : noop;

	params.Key[ keyAttribute ] = { S: counterId };
	_.extend( params, options.dynamodb );

	dynamo || ( dynamo = new AWS.DynamoDB() );

	request = dynamo.getItem(params, function (errorObject, data) {
		var error, lastValue;

		if ( errorObject ) {
			error = errorObject;
		} else if ( _.isEmpty( data ) ) {
			/**
			 * If the item doesn't exist, the response would be empty.
			 * Set `lastValue` to 0 when the item doesn't exist.
			 */
			lastValue = 0;
		} else {
			try {
				// Try to parse the count value. An exception will be thrown if it's not a valid number.
				lastValue = parseInt( data.Item[ countAttribute ].N, 10 );

				if ( !_.isNumber( lastValue ) || _.isNaN( lastValue ) ) {
					throw 'Could not parse incremented value (' + lastValue + ').';
				}
			} catch ( e ) {
				error = e;
			}
		}

		if ( error ) {
			if ( options.context ) {
				deferred.rejectWith( options.context, [ e ] );
			} else {
				deferred.reject( e );
			}
		} else {
			if ( options.context ) {
				deferred.resolveWith( options.context, [ lastValue ] );
			} else {
				deferred.resolve( lastValue );
			}
		}
	});

	/**
	 * Apply a promise interface to `request`, set the success, error, and complete callback, and return the promise.
	 */
	return deferred.promise( request ).done( successFn ).fail( errorFn ).always( completeFn );
};