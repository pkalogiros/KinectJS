/*********************************
* VERSION I, 22 Dec 2011
*---------------------------------
* Supports :
*	- Chrome / Firefox Support
*	- Two player tracking with 22 joints of information
*	- RGB (640x480) and Depth(320x240) image streaming
*	- Access and control of Kinect's motor
*	- Cursor object
*	- Modal with custom connection dialog
*	- Regions based interface
*	- Setting joints tracked, metrics mode, players number,
*	  sensor angle, distance to track, etc
*	- predefined gestures
*
* Guidelines :
*	_name 	  --> private members
*   camelCase --> functions
*   test_var  --> public variables
*	UPPERCASE --> constants
*	####	  --> 4 sharp symbols for critical commentary
*	q		  --> var q, is used as cache for 'this'
*
*	Author		: Pantelis Kalogiros
*	url			: kinect.childnodes.com
*	license		: http://www.opensource.org/licenses/mit-license.php
**********************************/
(function( parent ) {
	!parent && ( parent = window )

	//Private Variable Declaration
	var _ws = null,					//joints websocket instance
		_send_buffer = [],			//initial send buffer (configuration packets)
		_msg_arr = [],				//contains functions that will be called on each message received from the server
		_reg = {					//main configuration object, stores the user/app defined options and is sent to the socket server on initialization
			players  	: 2,						//max players (2 is the limit actually)
			relative 	: true,						//use relative tracking?
			meters	 	: false,					//if set, meters based tracking will be used, please see kinect.childnodes.com for documentation
			sensitivity	: false,					//use sensitivity? (only if percentage-based tracking)
			joints	 	: [ 'RIGHT_HAND', 'HEAD' ],	//which joints will be tracked?
			gestures 	: [ 'ESCAPE' ]				//and which gestures do we need? //example [ 'ESCAPE', 'SWIPE' ]
		},
		_escapeInterval = null,					//Timeout : placeholder for the escape gesture

	kinect = parent.kinect = {
		address : null,				//(string) server address ( with port specified )
		is_ready : false,			//(bool) is the websocket open and socket ready

		escape_duration	:	1700,	//(milliseconds int) duration of the custom escape gesture

		/** Modified on message received **/
		sk_len : 0,					//skeletons / players count
		coords : [					//coordinates object
			[{x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}],
			[{x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:0}]
		], //sample data

		//Functions Declaration
		/*****************************
		* send( STRING ) : chainable - Added on vI
		* ----------------------------
		* - Sends data through the websocket.
		* 	If the websocket is not ready then
		*	stores it for later use
		******************************/
		send : function( data ) {

			this.is_ready
			?	_ws.send( data )
			:	_send_buffer.push( data );

			return this;
		},
		/*****************************
		* getSetup()  - Added on vI
		* ----------------------------
		* - returns the _reg object
		*****************************/
		getSetup : function() {
			return _reg;
		},
		/*****************************
		* setUp( OBJECT ), chainable  - Added on vI
		* ----------------------------
		* - Accepts user defined options (see _reg object)
		* 	and pushes them to the buffer
		*****************************/
		setUp : function( obj ) {
			var message_array = [],
				len;

			_send_buffer = [];
			_extend( _reg, obj );

			message_array.push( this._jointsToInt( _reg.joints ).join('-') );

			if( _reg.meters ) {
				var tmp,
					rel = _reg.meters.reg,
					abs = _reg.meters.abs;

				if( rel )
				{
					tmp = "MR" + rel.x + "-" + rel.y + "-" + rel.z;
					message_array.push( tmp );
				}
				if( abs )
				{
					tmp = "MA" + abs.x + "-" + abs.y + "-" + abs.z;
					message_array.push( tmp );
				}
			}

			if( _reg.sensitivity )
				message_array.push( "S" + _reg.sensitivity );

			if( _reg.relative )
				message_array.push( "R1" );
			else
				message_array.push( "R0" );

			message_array.push( "G" + _reg.gestures.join('-') );
			message_array.push( "P" + _reg.players );

			len = message_array.length;

			while( len-- )
				this.send( message_array[ len ] );

			message_array = len = null;
			return this;
		},
		/*****************************
		* make( STRING ), chainable  - Added on vI
		* ----------------------------
		* - Accepts user defined ip address (with port)
		* 	example: 192.168.50.45:8820 - or for "localhost"
		*	only a port (example: 9200) which is given by the
		*	KinectSocketServer app (please read: http://kinect.childnodes.com)
		*****************************/
		make : function( addr ) {
			var q = this,
				ChromeOrMoz = null;	//#### since we only support Chrome / Moz, let's say 'webkit' for Chrome,
									//'firefox' for FireFox and false for not supported
									//support for IE10 will be available soon
			if( !addr )
				return false;

			//#### dirty sniff to see if we are using FireFox/Chrome
			!( ChromeOrMoz = _sniff() )
			&& q.browserNotSupported();

			addr.length === 4	//port specified
			&& ( addr = 'localhost:' + addr );

			ChromeOrMoz === "firefox"
			? _ws = new MozWebSocket( 'ws://' + addr )
			: _ws = new WebSocket( 'ws://' + addr );

			q.address = addr.replace( /\s+/g, '' ); //sanity check: removing spaces from the address

			//on open -- call the onConnect function and set 'is_ready' to true
			_ws.onopen = function() {
				q.is_ready = true;
				q.onConnect();

				var i = -1,
					buffer_interval;

				setTimeout( function() {
					buffer_interval = setInterval( function() {
						if( _send_buffer[ ++i ] )
							q.send( _send_buffer[ i ] );
						else {
							clearInterval( buffer_interval );
							buffer_interval = null;

							setTimeout( function() {	//approx 2 seconds later call the init function
								q._configInit();
							}, 1850 );					//#### perhaps the server should respond with a callback? "Allset"? Something less dirty
						}
						return false;
					}, 17 );
				}, 300 );
			};

			//on close -- call the onClose function and set is_ready to false
			_ws.onclose = function() {
				if( !kinect.is_ready ) //the socket was never open
				{
					kinect.onInvalid();
					return false;
				}
				kinect.is_ready = false;
				kinect.onClose();
			};
			//on message -- grab the coords, and call all the _msg_arr stored functions
			_ws.onmessage = function( e ) {
				var len = _msg_arr.length;

				q._coords( e );

				while( len-- )
					_msg_arr[ len ].call( q, e );
			}
			return q;
		},
		/*****************************
		* makeDepth( STRING, BOOL, STRING ), webWorker  - Added on vI
		* ----------------------------
		* - Accepts user defined ip address (with port)
		* 	example: 192.168.50.45:8820 - or for "localhost"
		*	OR uses the existing one for the joints websocket.
		*
		*	addr (string) - kinectSocketServer address, if left empty
		*					joints socket address will be used
		*
		*	webWorker (bool) - if set to true, the new socket will open
		*					 - within a webworker
		*
		*	path (string) - path to the webWorker javascript file,
		*						- if left empty (or unspecified) the default
		*						- one will be used
		*
		*	Depth - resolution 320 x 240
		*****************************/
		makeDepth : function( addr, WebWorker, path ) {
			var q = this,
				_depthWS,
				ChromeOrMoz = null;

			if( !addr && !this.address )	//if no address is specified and
			{								//no address is stored, wait for connection
				(function( addr, WebWorker, path ) {
					kinect.addEventListener( 'openedSocket', function() {
						if( kinect._depthWS )
						{
							kinect.makeDepth( addr, WebWorker, path );
							return false;
						}
					}, false );
				})( addr, WebWorker, path );
				return false;
			}

			!addr && ( addr = this.address );

			!( ChromeOrMoz = _sniff() )
			&& q.browserNotSupported();

			addr.length === 4	//port specified
			&& ( addr = 'localhost:' + addr );

			if( !WebWorker )
				ChromeOrMoz === "firefox"
				? _depthWS = new MozWebSocket( 'ws://' + addr + '/__depth/' )
				: _depthWS = new WebSocket( 'ws://' + addr + '/__depth/' );
			else
			{
				if( path && path.length > 1 )
					_depthWS = new Worker( path );
				else
					_depthWS = new Worker('workerSocket.js');

				_depthWS.postMessage({ addr : 'ws://' + addr + '/__depth/', socket : ChromeOrMoz });
			}
			kinect._depthWS = _depthWS;
			return _depthWS;
		},
		/*****************************
		* makeRGB( STRING ), webWorker  - Added on vI
		* ----------------------------
		* - Accepts user defined ip address (with port)
		* 	example: 192.168.50.45:8820 - or for "localhost"
		*	OR uses the existing one for the joints websocket.
		*
		*	addr (string) - kinectSocketServer address, if left empty
		*					joints socket address will be used
		*
		*	webWorker (bool) - if set to true, the new socket will open
		*					 - within a webworker
		*
		*	path (string) - path to the webWorker javascript file,
		*						- if left empty (or unspecified) the default
		*						- one will be used
		*
		*	RGB Resolution : 640 x 480
		*****************************/
		makeRGB : function( addr, WebWorker, path ) {
			var q = this,
				_rgbWS,
				ChromeOrMoz = null;

			if( !addr && !this.address )	//if no address is specified and
			{								//no address is stored, wait for connection
				(function( addr, WebWorker, path ) {
					kinect.addEventListener( 'openedSocket', function() {
						if( kinect._rgbWS )
						{
							kinect.makeRGB( addr, WebWorker, path );
							return false;
						}
					}, false );
				})( addr, WebWorker, path );
				return false;
			}

			!addr && ( addr = this.address );

			!( ChromeOrMoz = _sniff() )
			&& q.browserNotSupported();

			addr.length === 4	//port specified
			&& ( addr = 'localhost:' + addr );

			if( !WebWorker )
				ChromeOrMoz === "firefox"
				? _rgbWS = new MozWebSocket( 'ws://' + addr + '/__rgb/' )
				: _rgbWS = new WebSocket( 'ws://' + addr + '/__rgb/' );
			else
			{
				if( path && path.length > 1 )
					_rgbWS = new Worker( path );
				else
					_rgbWS = new Worker('workerSocket.js');

				_rgbWS.postMessage({ addr : 'ws://' + addr + '/__rgb/', socket : ChromeOrMoz });
			}

			kinect._rgbWS = _rgbWS;
			return _rgbWS;
		},
		/*****************************
		* close(), chainable  - Added on vI
		* ----------------------------
		* - Manually closes the connection
		*	(Chrome 17 has a bug with closing websocket connections, 
		*	 this is a possible solution)
		*****************************/
		close : function() {
			_ws.send("KILL");
			_ws.close();

			return this;
		},
		/*****************************
		* onInvalid(), onConnect(), onClose - Added on vI
		* ----------------------------
		* - PRIVATE, fire the corresponding events
		*****************************/
		onInvalid : function() {
			console.log("INVALID SOCKET");
			this.fireEvent( 'invalidSocket' );

			return false;
		},
		onConnect : function() {
			console.log("OPENED JOINTS SOCKET");
			this.fireEvent( 'openedSocket' );

			return false;
		},
		onClose : function() {
			console.log("CLOSED JOINTS SOCKET");
			this.fireEvent( 'closedSocket' );

			return false;
		},
		/*****************************
		* reconnect( STRING ), Boolean  - Added on vI
		* ----------------------------
		* - Calls make, with the same address
		*	returns true on reconnect attempt
		*	and false on abort.
		*****************************/
		reconnect : function() {
			if( this.addr && !this.is_ready ) {
				this.make( this.addr );
				this.fireEvent( 'reconnect' );
				return true;
			}
			return false;
		},
		/*****************************
		* _coords( e ), called automatically  - Added on vI
		* ----------------------------
		* - Accepts json returned from the KinectWebSocketServer
		* and evaluates it, storing it either in the kinect.coords object
		* or calls a function nested in the _ object ( gestures )
		*****************************/
		_coords : function( e ) {
			"use strict";				//restricting the scope of eval

			var _ = this._,				//and giving access to the _ object
				cache = eval( e.data );	// #### TODO: perhaps use new Function instead of eval?
										// or JSON.parse, and a lookup table?
			if( !cache )
				return false;

			this.coords = cache;
			this.sk_len = this.coords.length;

			return false;
		},
		/*****************************
		* onMessage( FUNCTION ), chainable  - Added on vI
		* ----------------------------
		* - Pushes a function to the _msg_arr array, functions that run
		*	on message received
		*****************************/
		onMessage : function( func ) {
			_msg_arr.push( func );

			return this;
		},
		//CONFIG FUNCTIONS
		/*****************************
		* _configInit(), editable  - Added on vI
		* ----------------------------
		* - Called when the reg object
		*	(config) has been sent to the server
		*****************************/
		_configInit : function() {
			console.log('Kinect Ready');
			this.fireEvent( 'kinectReady' );
			return false;
		},
		/*****************************
		* onPlayerFound(), chainable  - Added on vI
		* ----------------------------
		* - Functions pushed, will be called when a player is detected by the kinect
		*****************************/
		onPlayerFound : function( func ) {
			this.addEventListener( 'playerFound', func );
			return this;
		},
		/*****************************
		* onPlayerLost(), chainable  - Added on vI
		* ----------------------------
		* - Functions pushed, will be called when a player is 'lost'
		*****************************/
		onPlayerLost : function( func ) {
			this.addEventListener( 'playerLost', func );
			return this;
		},
		/*****************************
		* fireEvent( STRING, ARRAY ), chainable  - Added on vI
		* ----------------------------
		* - Fires a custom event to the event-sink object
		*****************************/
		fireEvent : function( vnt, args ) {
			var func_arr = this._sink[ vnt ],
				len;

			func_arr
			? len = func_arr.length
			: len = 0;

			// args should be an array, (for .call)
			// we can also push the function index
			// for unnamed function handling
			while( len-- )
				func_arr[ len ].call( this, args );

			func_arr = len = null;
			return this;
		},
		/*****************************
		* addEventListener( EVENT NAME, FUNCTION NAME ), chainable  - Added on vI
		* ----------------------------
		* - Adds an event Listener and its callback to the div sink
		*****************************/
		addEventListener : function( vnt, func ) {
			if( !this._sink[ vnt ] )
				 this._sink[ vnt ] = [];

			this._sink[ vnt ].push( func );

			return this;
		},
		/*****************************
		* removeEventListener( EVENT NAME, FUNCTION NAME ), chainable  - Added on vI
		* ----------------------------
		* - Removes an event Listener from the sink div
		*****************************/
		removeEventListener : function( vnt, func ) {
			var func_arr = this._sink[ vnt ],
				len,
				index = false,
				i = -1;

			if( !func_arr )
				return false;

			len = func_arr.length;

			while( ++i < len )
				if( func_arr[ i ] == func )
				{
					index = i;
					break;
				}

			if( index )
				this._sink[ vnt ] = func_arr.slice( 0, index ).concat( func_arr.slice( index + 1, func_arr.length ) );

			func_arr = len = index = i = null;
			return this;
		},
		/*****************************
		* removeAllListeners( EVENT NAME ), chainable  - Added on vI
		* ----------------------------
		* - Removes all listeners of a specified event
		*****************************/
		removeAllListeners : function( vnt ) {
			this._sink[ vnt ] = null;

			return this;
		},
		//#### Invoke only from KinectWebSocketServer
		_ : {
			/*****************************
			* PLFOUND( int )
			* calls functions on player lost
			* count = the ammount of players
			*****************************/
			PLLOST : function( count ) {
				kinect.fireEvent( 'playerLost', [ count ] );

				return false;
			},
			/*****************************
			* PLFOUND( int )
			* calles the functions called on player found
			* count = the ammount of playerss
			*****************************/
			PLFOUND : function( count ) {
				kinect.fireEvent( 'playerFound', [ count ] );

				return false;
			},
			/*****************************
			* NOPLAYERS()
			* ----------------------------
			* - Called when there are no players on the screen
			*****************************/
			NOPLAYERS : function() {
				kinect.fireEvent( 'noPlayers' );

				return false;
			},
			//available gestures,
			//SWIPE, ESCAPE, ESCAPE2, HANDS_DIST, FOOT_LEAN, JUMP, STANCE, BODY_ANGLE
			/*****************************
			* SWIPE( int, int, string )
			* ----------------------------
			* index (int) - the player who performed the swipe
			* joint (int) - which joint performed the swipe
			* direction (string const) - which direction ( top, right, bottom, left )
			*****************************/
			SWIPE	: function( index, joint, direction ) {
				kinect.fireEvent( 'gestureSwipe', [ index, joint, direction ] );

				return false;
			},
			/*****************************
			* JUMP( int )
			* ----------------------------
			* index (int) - the player who jumped
			*****************************/
			JUMP	: function( index ) {
				kinect.fireEvent( 'gestureJump', [ index ] );

				return false;
			},
			/*****************************
			* ESCAPE( int )
			* ----------------------------
			* Custom escape gestures used
			* index (int) - player index
			*****************************/
			ESCAPE	: function( index, bool ) {
				kinect.fireEvent( 'gestureEscape', [ index, bool ] );

				if( index !== 0 )
					return false;
						
				clearTimeout( _escapeInterval );
				if( bool )
				{
					_escapeInterval = setTimeout( function() {
						clearTimeout( _escapeInterval );
						_escapeInterval = null;

						kinect.fireEvent( 'escapeInterval', [ index ] );
						index = bool = null;
					}, kinect.escape_duration );
				}
				else
					_escapeInterval = null;
					
				return false;
			},
			/*****************************
			* HANDS_DIST( int, bool )
			* ----------------------------
			* Fires, gestureCrank_ON when the player has his both arms
			* extended, and gestureCrank_OFF when contracted
			*****************************/
			HANDS_DIST : function( index, bool ) {
				if( bool )
					kinect.fireEvent( 'gestureCrank_ON', [ index ] );
				else
					kinect.fireEvent( 'gestureCrank_OFF', [ index ] );
				return false;
			},
			/*****************************
			* FOOT_LEAN( int, string, string )
			* ----------------------------
			* Leg posture ( akin to the swipes )
			* - index ( int ) : player index
			* - leftRight ( int ) : 'left' or 'right' leg
			* - action ( int ) : direction of the movement
			*
			* example of event fired
			* gestureFootLean with args [ 0, 'left', 'right' ]
			*****************************/
			FOOT_LEAN : function( index, leftRight, action ) {
				var footIndex = leftRight === 15 ? 'left' : 'right';

				kinect.fireEvent( 'gestureFootLean', [ index, footIndex, action ] );

				footIndex = null;
				return false;
			},
			/*****************************
			* BODY_ANGLE( int, string )
			* ----------------------------
			* Is fired when the player has his shoulders angled
			* relative to the kinect,
			* - index ( int ) 		: player index
			* - rotation ( string ) : rotation direction ( left, right )
			*****************************/
			BODY_ANGLE : function( index, rotation ) {
				kinect.fireEvent( 'gestureBodyTurning', [ index, rotation ] );

				return false;
			},
			
			FIRE	: function( args ) {
				kinect.fireEvent( 'externalButtonPress', args );
				
				return false;
			},
			/*****************************
			* MOTOR( int )
			* ----------------------------
			* Is fired after the user requests
			* the angle data from the kinect
			* is not actually a gestures, but it is called 
			* through the _ object
			*****************************/
			MOTOR	: function( deg ) {
				if( kinect.motor )
					kinect.motor.currentAngle = deg;
				
				kinect.fireEvent( 'motorAngleUpdated', [ deg ] );
				return false;
			}
		},
		/*****************************
		* scanForHead(), chainable  - Added on vI
		* ----------------------------
		* - Forces the Kinect to adjust its angle, so that the 
		*	first user's head is within proper range
		*****************************/
		scanForHead : function() {
			this.send("H");
			return this;
		},
		//TRACKING CONFIG FUNCTIONS
		/*****************************
		* toggleRelative(), chainable  - Added on vI
		* ----------------------------
		* - Toggles Relativity on tracking data
		*****************************/
		toggleRelative : function() {
			this.send("R");
			_reg.relative = !_reg.relative;

			return this;
		},
		/*****************************
		* setRelative( BOOLEAN ), chainable  - Added on vI
		* ----------------------------
		* - Sets Relative tracking,
		*	depends on the boolean val
		*****************************/
		setRelative : function( bool ) {
			if( bool )
			{
				this.send("R1");
				_reg.relative = true;
			}
			else
			{
				this.send("R0");
				_reg.relative = false;
			}
			return this;
		},
		/*****************************
		* setJoints( ARRAY ), chainable  - Added on vI
		* ----------------------------
		* - sets and sends new joint data (overwrites previous)
		*****************************/
		setJoints : function( joints ) {
			this.send( this._jointsToInt( joints ).join('-') );
			_reg.joints = joints;

			return this;
		},
		/*****************************
		* setPercentageMode(), chainable  - Added on vI
		* ----------------------------
		* - Deactivates the meters metric mode,
		*	and lets the Percentage Mode take over
		*****************************/
		setPercentageMode : function() {
			this.send( "M0" );
			_reg.meters = null;

			return this;
		},
		/*****************************
		* setPlayers( INT ), chainable  - Added on vI
		* ----------------------------
		* - sets and sends new player data
		*****************************/
		setPlayers : function( num ) {
			this.send( "P" + num );
			_reg.players = num;

			return this;
		},
		/*****************************
		* setSensitivity( FLOAT ), chainable  - Added on vI
		* ----------------------------
		* - sets and sends new sensitivity data (percentage based tracking only)
		*****************************/
		setSensitivity : function( num ) {
			this.send( "S" + num );
			_reg.sensitivity = num;

			return this;
		},
		/*****************************
		* addJoint( STRING ), chainable  - Added on vI
		* ----------------------------
		* - adds a joint to the tracking data
		*****************************/
		addJoint : function( joint ) {
			//check to see if the joint already exists
			var len = _reg.joints.length,
				flag = false;

			while( len-- )
				if( _reg.joints[ flag ] === joint ) {
					flag = true;
					break;
				}

			if( !flag )
			{
				_reg.joints.push( joint );
				this.send( this._jointsToInt( _reg.joints ).join('-') );
			}
			return this;
		},
		//UTIL FUNCTIONS
		/*****************************
		* _jointsToInt( OBJECT ), array  - Added on vI
		* ----------------------------
		* - Converts a string specified joint array(HAND_RIGHT, HEAD etc)
		*	to an int one (as specified by the MS Kinect SDK)
		*****************************/
		_jointsToInt : function( joint_array ) {
			var ret = [],
				joinLen = joint_array.length,
				tmp;

			while( joinLen-- ) {
				switch( joint_array[ joinLen ] ) {
					case ( "ANKLE_LEFT" ) :
						tmp = 14;
					break;
					case ( "ANKLE_RIGHT" ) :
						tmp = 18;
					break;
					case ( "ELBOW_LEFT" ) :
						tmp = 5;
					break;
					case ( "ELBOW_RIGHT" ) :
						tmp = 9;
					break;
					case ( "FOOT_LEFT" ) :
						tmp = 15;
					break;
					case ( "FOOT_RIGHT" ) :
						tmp = 19;
					break;
					case ( "HAND_LEFT" ) :
						tmp = 7;
					break;
					case ( "HAND_RIGHT" ) :
						tmp = 11;
					break;
					case ( "HIP_CENTER" ) :
						tmp = 0;
					break;
					case ( "HIP_LEFT" ) :
						tmp = 12;
					break;
					case ( "HIP_RIGHT" ) :
						tmp = 16;
					break;
					case ( "KNEE_LEFT" ) :
						tmp = 6;
					break;
					case ( "KNEE_RIGHT" ) :
						tmp = 17;
					break;
					case ( "SPINE" ) :
						tmp = 1;
					break;
					case ( "SHOULDER_CENTER" ) :
						tmp = 2;
					break;
					case ( "HEAD" ) :
						tmp = 3;
					break;
					case ( "SHOULDER_LEFT" ) :
						tmp = 4;
					break;
					case ( "SHOULDER_RIGHT" ) :
						tmp = 8;
					break;
					case ( "WRIST_LEFT" ) :
						tmp = 6;
					break;
					case ( "WRIST_RIGHT" ) :
						tmp = 10;
					break;
					case ( "BODY_ANGLE" ) :	//augmented bits
						tmp = 20;
					break;
					case ( "HANDS_DIST" ) :
						tmp = 21;
					break;
				}
				ret.unshift( tmp );
			}
			return ret;
		},
		/**********************************
		* threshold( NUMBER, NUMBER, NUMBER ) number util, Added on vI
		* --------------------------------
		* - Accepts a number, and a lower and higher value
		* 	cuts off the values that exceed the ones specified in
		* 	min & max
		**********************************/
		threshold : function( num, min, max ) {
			return num > max ? max : ( num < min ? min : num );
		},
		/**********************************
		* qeue( FUNCTION, INT ) chainable util, Added on vI
		* --------------------------------
		* - Schedules a function (callback), to be called in
		*   time ms with the kinect as its 'this' object,
		*	if no time is specified, thenn 1 second will be used
		**********************************/
		qeue : function( callback, time ) {
			setTimeout( function() {
				callback.call( kinect );
				callback = null;
				return false;
			}, !!time ? time : 1000 );

			return this;
		},

		/**********************************
		* browserNotSupported(), Added on vI
		* --------------------------------
		* - Called if the browser does not support websockets
		*	Feel free to override this function with yours
		**********************************/
		browserNotSupported : function() {
			kinect.fireEvent( "notSupported" );

			if( kinect.modal )	//modal behavior
			{
				var cached = kinect.modal;

				!cached.is_visible && ( cached.show() );

				cached.modal.innerHTML = '\
					<div id="knctGrnStrp" class="_c' + (( Math.random() * 4 + 1 ) >> 0 ) + '">\
					<div><h2>KinectJS</h2>\
					<p>You are using an unsupported browser : ( </p>\
					</div></div>';

				cached = null;
			}
			else	//regular behavior
				throw( "Your browser is not supported." );

			return false;
		},

		_sink : {}
		
		//END
	},
	/**********************************
	* _extend( OBJECT, OBJECT ) util, Added on vI
	* --------------------------------
	* - Simply extends the "target" object by adding to it
	* 	the "seed" one (no deep cloning, but it suffices)
	**********************************/
	_extend = function( target, seed ) {
		var key;

		for( key in seed )
			if( typeof target[ key ] !== "object" || ( typeof target[ key ] === "object" && target[ key ].length ))
				target[ key ] = seed[ key ];
			else
				_extend( target[ key ], seed[ key ] );
	},
	/**********************************
	* _sniff() util, Added on vI
	* --------------------------------
	* - Returns the browser css prefix
	* 	Avoids user agent string checking - currently
	* 	there is only support for Chrome 14+ and FF8+
	**********************************/
	_sniff	= function() {
		if( parent.WebSocket )
			return 'chrome';
		else if( parent.MozWebSocket )
			return 'firefox';
		else
			return false;
	};
})( window );

/*********************************
* KINECT MOTOR, 19/02/2012
*---------------------------------
* Accesses the Kinect Motor
**********************************/
(function( kinect ) {
	kinect.motor = {
		currentAngle	: null,
		scanForHead 	: kinect.scanForHead,
		
		/*********************************
		* getCurrentAngle(), chainable added on vI
		*---------------------------------
		* Contacts the socket Server, to retrieve 
		* the current kinect angle, it doesnot return the value
		* since it is an async function, the motor.currentAngle
		* will be updated instead, and an event fired (motorAngleUpdated)
		* returns kinect object
		**********************************/
		getCurrentAngle : function() {
			kinect.send("H_");
			return kinect;
		},
		/*********************************
		* defaultAngle(), chainable added on vI
		*---------------------------------
		* Resets the kinects angle
		**********************************/
		defaultAngle : function() {
			kinect.send("H:-6");
			return kinect;
		},
		/*********************************
		* getCurrentAngle( INT ), chainable added on vI
		*---------------------------------
		* Sets the current Kinect angle,
		* the value is filtered for out of range values
		* 
		* returns kinect object
		**********************************/
		setCurrentAngle	: function( deg ) {
			deg = kinect.threshold( ( deg / 1 ), -20, 20 );
			if( !!deg )
			{
				kinect.send( "H:" + deg );
				this.currentAngle = deg;
			}
			else
				throw( "wrong angle value" );

			return kinect;
		}
	};
})( kinect );

/*********************************
* KINECT MODAL, 4/02/2012
*---------------------------------
* A modal window which simplifies connecting
* to a KinectSocketServer
**********************************/
(function( kinect ) {
	kinect.modal = {							//randomly select a class
		template : '<div id="knctGrnStrp" class="_c' + (( Math.random() * 4 + 1 ) >> 0 ) + '"><div style="display:none;">\
					<h2>KinectJS</h2><form action="" onsubmit="return kinect.modal._connect()">\
					Please input the Socket Server\'s address and/or port.<br />\
					For more information please visit <a href="http://kinect.childnodes.com">http://kinect.childnodes.com</a>\
					<br /><br /><input id="__prt" type="text"/><input class="submit" type="submit" value="Go" /></form></div></div><div>',
		modal	 : null,										//actual modal object
		/*********************************
		* make( STRING ), chainable added on vI
		*---------------------------------
		* initializes the modal
		* css (string) - Path to custom css file (styling of the modal)
		* if no path is specified the default styling is used
		**********************************/
		make : function( css ) {
			var doc = document,									//document to local variable
				body = doc.getElementsByTagName('body')[0],
				overlay =  doc.createElement('aside'),			//modal overlay, <aside> for political correctness
				cssNode =  doc.createElement('link'),			//css to be appended
				q = this,										//instance of this
				domLoad = function() {							//called on DOMContentLoaded
					doc.removeEventListener( 'DOMContentLoaded', domLoad );
					doc.getElementsByTagName('body')[0].appendChild( overlay );

					doc = domLoad = null;

					q.show();
				};

			cssNode.type = 'text/css';						//configuring the css
			cssNode.id 	= 'kinectModalCSS';					//adding a dummy id so you can grab and kill it if you think its no fun
			cssNode.rel = 'stylesheet';
			cssNode.media = 'screen';

			!css
			? 	cssNode.href = 'http://kinect.childnodes.com/knctModal.css' //my own custom css file - you do not need this if you specify a css argument
			:	cssNode.href = css; //your own css path

			setTimeout(function(){
				var div = q.modal.getElementsByTagName('div')[1];
				if( div )
					div.style.display = 'block';
				div = null;
			},500);

			doc.getElementsByTagName('head')[0].appendChild( cssNode );
			overlay.id = 'kinectModal';
			overlay.innerHTML = q.template;

			q.modal = overlay;

			//listeners - making the modal reappear on disconnect etc
			kinect.addEventListener( 'openedSocket', function() {
				q.hide();	//if we are connected to a valid socket hide the modal
			});

			kinect.addEventListener( 'closedSocket', function() {	//socket disconected
				q.modal.firstChild.className = "closedSocket";
				q.show();
			});

			kinect.addEventListener( 'invalidSocket', function() {	//if the user didnot provide a valid value...
				q.modal.firstChild.className = "invalidSocket";
				q.show();
			});

			if( this.is_ready ) {
				q.hide();
				body.appendChild( overlay );

				overlay = cssNode = body = null;
				return this;
			}

			if( body ) {
				body.appendChild( overlay );
				q.show();
				domLoad = null;
			}
			else
				doc.addEventListener( 'DOMContentLoaded', domLoad, false );

			setTimeout( function() {	//start with the modal's window focused
				if( document.getElementById('__prt') )
					document.getElementById('__prt').focus();
			}, 260);

			overlay = cssNode = body = null;
			return kinect;
		},
		/*********************************
		* show(), added on vI
		*---------------------------------
		* shows the modal
		**********************************/
		show : function() {
			this.modal.className = 'act';
			this.is_visible = true;
			return false;
		},
		/*********************************
		* hide(), added on vI
		*---------------------------------
		* hides the modal
		**********************************/
		hide : function() {
			this.modal.className = '';
			this.is_visible = false;
			return false;
		},
		/*********************************
		* _connect(), added on vI
		*---------------------------------
		* Tries to connect to the websocket
		**********************************/
		_connect : function() {
			var data = document.getElementById('__prt').value;
			this.onConnect( data );

			return false;
		},
		/*********************************
		* onConnect( STRING ), added on vI
		*---------------------------------
		* if valid data is specified, tried to connect
		* to that data (address)
		*
		* data (string) - should be either a port or a full
		* blown address
		**********************************/
		onConnect : function( data ) {
			if( data.length > 3 )
				kinect.make( data );

			return false;
		}
	};
	//END
})( kinect );

/*********************************
* KINECT NOTIFICATIONS, 4/02/2012
*---------------------------------
* Small pop up notifications that make the
* user aware of actions that occured
* ( for example : player found, lost etc )
**********************************/
(function( kinect ) {
	/*********************************
	* _build(), added on vI
	*---------------------------------
	* builds, configures, and appends the div container
	**********************************/
	var	_build = function() {
		var body = document.getElementsByTagName('body')[0],
			div = document.createElement('div'),
			q = kinect.notif;

		document.removeEventListener( 'DOMContentLoaded', _build );

		div.id = "kinectNotif";
		body.appendChild( div );
		q.cont = div;

		div = body = q = null;
		return false;
	};

	kinect.notif = {
		cont : null,
		duration : 1600,	//duration of each notification
		/*********************************
		* make(), chainable added on vI
		*---------------------------------
		* initializes the notifications module
		**********************************/
		make : function() {
			var body = document.getElementsByTagName( 'body' )[ 0 ],
				q = this;

			if( body )
				_build();
			else
				document.addEventListener( 'DOMContentLoaded', _build, false );

			return kinect;
		},

		/*********************************
		* push( STRING, INT ), chainable added on vI
		*---------------------------------
		* Creates a new notification
		* txt (string) - notification's text
		* duration (int) - how long it should stay on the screen
		**********************************/
		push : function( txt, duration ) {
			var cont = this.cont,
				notif = document.createElement( 'span' ),
				notifStyle = notif.style,
				q = this;

			!duration && ( duration = 3820 );

			notif.innerHTML = txt;
			
			if( notif.innerHTML == '' )
				notif.textContent = txt;
				
			cont.appendChild( notif );
			notifStyle.opacity = 0.9;	//making it active

			//scheduling its demise - hacky but sufficient way
			setTimeout(function() {
				notif.className = "kinectFadeOut";
				setTimeout( function() {
					if( cont && notif )
						cont.removeChild( notif );
				}, q.duration );
			}, duration );

			return this;
		},
		/*********************************
		* clearAll(), chainable added on vI
		*---------------------------------
		* Removes all notifications
		**********************************/
		clearAll : function() {
			var cont = this.cont,
				children = cont.childNodes,
				len = children.length;

			while( len-- )
				cont.removeChild( children[ len ] );

			cont = children = len = null;

			return this;
		}
	};
	//end
})( kinect );


/*********************************
* KINECT CURSOR, 7/02/2012
*---------------------------------
* Default cursor object, controled by the first player always (the joint can be specified)
* and is able to dispatch events such as kinectTouchStart, kinectTouchMove
* kinectTouchEnd, kinectTouchPushStart, kinectTouchPushEnd - to specified regions
*
* :: WORK IN PROGRESS so a couple of things are bound to change
* documentation will be added soon
**********************************/
(function( kinect ) {
	//private util funcs
	var _breakCountdown = function() {
			clearInterval( countdown_interval );
			cursor.className = "";
			cursor.innerHTML = "3";
		},
		doc = document,
		_dispatchEvent = function( event, target ) {
			var evObj = doc.createEvent( 'MouseEvents' );
			evObj.initEvent( event, true, true );

			if( target )
				target.dispatchEvent( evObj );

			return false;
		},
		_calculatePos = null,
		_smoothingVal = null,
		_calcNoSmoothing = function() {
			var coords = kinect.coords,
				len = overlapArr.length,
				overlap,
				q = _cursorObj,
				flag = false,
				jointNum = q.joint,
				cursorPos,
				gravity = q.gravity,
				oldPos = { x: q.x, y: q.y };

			if( q.bothHands )
			{
				var bothHands = q.bothHands;

				if( !coords[ 0 ][ bothHands.left ] )
					return false;

				if( coords[ 0 ][ bothHands.left ].z < coords[ 0 ][ bothHands.right ].z )
					cursorPos = { x: coords[ 0 ][ bothHands.left ].x, y: coords[ 0 ][ bothHands.left ].y, z: coords[ 0 ][ bothHands.left ].z };
				else
					cursorPos = { x: coords[ 0 ][ bothHands.right ].x, y: coords[ 0 ][ bothHands.right ].y, z: coords[ 0 ][ bothHands.right ].z };
			}
			else
				cursorPos = { x: coords[ 0 ][ jointNum ].x, y: coords[ 0 ][ jointNum ].y, z: coords[ 0 ][ jointNum ].z };

			// #### by default the first joint of the first player controls the cursor
			//gravity comes in play
			if( gravity )
			{
				cursorPos.x = oldPos.x - ( oldPos.x - cursorPos.x ) / gravity;
				cursorPos.y = oldPos.y - ( oldPos.y - cursorPos.y ) / gravity;
			}

			q.cursorStyle.left = q.x = cursorPos.x + '%';
			q.cursorStyle.top = q.y = cursorPos.y + '%';

			while( len-- )
				if( overlap = _checkOverlap( overlapArr[ len ], q._cursor, cursorPos ) )
				{
					q.overlapEl = overlapArr[ len ];
					flag = true;
					break;
				}

			if( !flag )	//element has no overlap
			{
				if( q.prvOverlapEl )
				{
					_dispatchEvent( 'kinectTouchEnd', q.prvOverlapEl );
					_breakCountdown();
				}
				q.overlapEl = q.prvOverlapEl = false;
				q.gravity = null;
			}
			else
			{
				//element overlap
				if( !q.prvOverlapEl )
				{
					_dispatchEvent( 'kinectTouchStart', q.overlapEl );

					//the overlap is new - so perform action check and call
					_actionCheck( q.overlapEl );
				}
				//same element, check to see if we moved
				else if( q.prvOverlapEl == q.overlapEl )
				{
					if( ( cursorPos.x !== q.x || cursorPos.y !== q.y ) )
						_dispatchEvent( 'kinectTouchMove', q.overlapEl );

					if( -cursorPos.z >= q.armExtendedThreshold )
					{
						if( !q.armExtended )
							_dispatchEvent( 'kinectTouchPushStart', q.overlapEl );

						q.armExtended = true;
					}
					else
					{
						if( !q.armExtended )
							_dispatchEvent( 'kinectTouchPushEnd', q.overlapEl );

						q.armExtended = false;
					}
				}
				//diff el, dispatch touchend and touchstart to the new
				else
				{
					_dispatchEvent( 'kinectTouchEnd', q.prvOverlapEl );
					q.prvOverlapEl = false;
					_dispatchEvent( 'kinectTouchStart', q.overlapEl );

					//the overlap is new - so perform action check and call
					_actionCheck( q.overlapEl );
				}

				q.prvOverlapEl = q.overlapEl;
			}

			q.x = cursorPos.x;
			q.y = cursorPos.y;
			q.z = cursorPos.z;

			return this;
		},
		_calcWithSmoothing = function() {
			var coords = kinect.coords,
				q = _cursorObj,
				len = overlapArr.length,
				overlap,
				flag = false,
				jointNum = q.joint,
				cursorPos,
				gravity = q.gravity,
				oldPos = { x: q.x, y: q.y };

			if( q.bothHands )
			{
				var bothHands = q.bothHands;

				if( !coords[ 0 ][ bothHands.left ] )
					return false;

				if( coords[ 0 ][ bothHands.left ].z < coords[ 0 ][ bothHands.right ].z )
					cursorPos = { x: coords[ 0 ][ bothHands.left ].x, y: coords[ 0 ][ bothHands.left ].y, z: coords[ 0 ][ bothHands.left ].z };
				else
					cursorPos = { x: coords[ 0 ][ bothHands.right ].x, y: coords[ 0 ][ bothHands.right ].y, z: coords[ 0 ][ bothHands.right ].z };
			}
			else
				cursorPos = { x: coords[ 0 ][ jointNum ].x, y: coords[ 0 ][ jointNum ].y, z: coords[ 0 ][ jointNum ].z };

			//smoothing
			cursorPos.x = oldPos.x - ( oldPos.x - cursorPos.x ) / _smoothingVal;
			cursorPos.y = oldPos.y - ( oldPos.y - cursorPos.y ) / _smoothingVal;

			if( gravity )
			{
				cursorPos.x = oldPos.x - ( oldPos.x - cursorPos.x ) / gravity;
				cursorPos.y = oldPos.y - ( oldPos.y - cursorPos.y ) / gravity;
			}

			q.cursorStyle.left = q.x = cursorPos.x + '%';
			q.cursorStyle.top = q.y = cursorPos.y + '%';

			while( len-- )
				if( overlap = _checkOverlap( overlapArr[ len ], q._cursor, cursorPos ) )
				{
					q.overlapEl = overlapArr[ len ];
					flag = true;
					break;
				}

			if( !flag )	//element has no overlap
			{
				if( q.prvOverlapEl )
				{
					_dispatchEvent( 'kinectTouchEnd', q.prvOverlapEl );
					_breakCountdown();
				}
				q.overlapEl = q.prvOverlapEl = false;
				q.gravity = null;
			}
			else
			{
				//if element has overlap
				if( !q.prvOverlapEl )
				{
					_dispatchEvent( 'kinectTouchStart', q.overlapEl );

					//the overlap is new - so perform action check and call
					_actionCheck( q.overlapEl );
				}
				//same element, check to see if we moved
				else if( q.prvOverlapEl == q.overlapEl )
				{
					if( ( cursorPos.x !== q.x || cursorPos.y !== q.y ) )
						_dispatchEvent( 'kinectTouchMove', q.overlapEl );

					if( -cursorPos.z >= q.armExtendedThreshold )
					{
						if( !q.armExtended )
							_dispatchEvent( 'kinectTouchPushStart', q.overlapEl );

						q.armExtended = true;
					}
					else
					{
						if( !q.armExtended )
							_dispatchEvent( 'kinectTouchPushEnd', q.overlapEl );

						q.armExtended = false;
					}
				}
				//diff el, dispatch touchend and touchstart to the new
				else
				{
					_dispatchEvent( 'kinectTouchEnd', q.prvOverlapEl );
					q.prvOverlapEl = false;
					_dispatchEvent( 'kinectTouchStart', q.overlapEl );

					//the overlap is new - so perform action check and call
					_actionCheck( q.overlapEl );
				}

				q.prvOverlapEl = q.overlapEl;
			}

			q.x = cursorPos.x;
			q.y = cursorPos.y;
			q.z = cursorPos.z;

			return this;
		},

		_actionCondition = function() {
			return true;
		},

		_actionCheck = function( obj ) {
			clearInterval( countdown_interval );

			if( obj.onclick )
			{
				cursor.innerHTML = "3";	//#### hard coded for now
				cursor.className += " count";

				countdown_interval = setInterval(function() {
					var curr = parseInt( cursor.innerHTML );

					if( curr === 0 )
					{
						clearInterval( countdown_interval );
						cursor.className = "hide";

						var t;
						if( t = obj.parentNode.getElementsByClassName('active')[ 0 ] )
							t.className = t.className.substr( 0, t.className.length - 6 );

						obj.className += " active";

						obj.onclick();
						obj = false;
						kinect.cursor.obj = false;
					}
					cursor.innerHTML = curr - 1;
				}, kinect.cursor.overlap_interval );
			}

			return false;
		},

		countdown_interval = false,

		cursor = false,
		cursorStyle = false,

		overlapArr = [],

		_checkOverlap = function( target, cursor, cursorPos ) {
			if( !_actionCondition() )
				return false;

			var target_abs = absolutePosition( target ),
				cursor_abs = cursorPos,

				top1 = target_abs.y,
				left1 = target_abs.x,
				right1 = left1 + target.offsetWidth,
				bottom1 = top1 + target.offsetHeight,
				tmpPar = target.parentNode;

				if( tmpPar && tmpPar.style.overflow == "hidden" )
					bottom1 = tmpPar.offsetHeight + 20;

			var	top2 = cursor_abs.y * window.innerHeight / 100,
				left2 = cursor_abs.x * window.innerWidth / 100,
				right2 = left2 + cursor.offsetWidth,
				bottom2 = top2 + cursor.offsetHeight,
				getSign = function( v ) {
					if( v > 0 )
						return 1;
					else if( v < 0 )
						return -1;
					else
						return 0;
				};

			if( bottom1 == 0 && top1 === 0 )
				return false;
				
			if( ( getSign( top1 - bottom2 ) !== getSign( bottom1 - top2 ) ) &&
				( getSign( left1 - right2 ) !== getSign( right1 - left2 ) ) )
				{
					kinect.cursor.gravity = target.gravity;
					return true;
				}
			return false;
		},
		absolutePosition = function( elm ) {
			var posObj = { x: elm.offsetLeft, y: elm.offsetTop };
			if( elm.offsetParent )
			{
				var temp_pos = absolutePosition( elm.offsetParent );
				posObj.x += temp_pos.x;
				posObj.y += temp_pos.y;
			}
			return posObj;
		};

	/*****************************
	* Visible kinect.cursor object
	******************************/
	kinect.cursor = {
		_cursor		: null,		//cursor div element
		overlapEl	: null,		//hovered element
		prvOverlapEl: null,		//previous element
		
		status		: false,	//is the cursor active? By default false

		x			: 0,		//coordinates
		y			: 0,
		z			: 0,

		joint		: 0,		//joint (#### THIS IS RELATIVE TO THE SPECIFIED TRACKED JOINTS - not to the joints codenumbers )
		bothHands   : false,	//be able to switch cursor ( only if both hands are tracked )

		step		: 56,		//step for cursor recalculation
		interval	: false,	//interval of recalculation

		overlap_interval :	650, 	//called 3 times before activating the current region

		armExtended : false,		//is the arm extended/pushing
		armExtendedThreshold : 42,	//% for extended hand
		deactivateRelativeVal: true,//the cursor is ALWAYS RELATIVELY TRACKED, this variable stores the current 'relative:Boolean' value

		/*****************************
		* make(), chainable added on vI
		* -----------------------------
		* Initializes the cursor object
		******************************/
		make : function() {
			var q = this,
				body = document.getElementsByTagName('body')[0],
				div;

			if( !( div = document.getElementById( '_cursor' ) ) )
			{
				div = document.createElement( 'div' );
				div.id = "_cursor";
			}

			_calculatePos = _calcNoSmoothing;

			q._cursor = cursor = div;
			q.cursorStyle = cursorStyle = div.style;

			body
			?	body.appendChild( div )
			:	document.addEventListener( 'DOMContentLoaded', function() {
					document.getElementsByTagName('body')[0].appendChild( div )
				}, false);

			return this;
		},
		/*****************************
		* useSmoothing( NUMBER ), chainable added on vI
		* -----------------------------
		* Specifies smoothing var
		* so that the cursor doesnot jump around
		******************************/
		useSmoothing : function( val ) {
			if( !val )
				_calculatePos = _calcNoSmoothing;
			else
			{
				_calculatePos = _calcWithSmoothing;
				_smoothingVal = val;
			}
			return this;
		},
		action	 : function( str, val ) {
			if( !str  )		//on hover
			{
				_actionCondition = function() {
					return true;
				};
			}
			else if( str === 'z-axis' ) //overlap only if z > val || if z < 0 && x or y is > 100 )
			{
				_actionCondition = function() {	// /1 as a quick way to use as number
					if( ( _cursorObj.z / 1 ) < val
						||	(	//#### hardcoded as of vI
								(  _cursorObj.z / 1 ) < -5 && ( ( Math.abs( _cursorObj.y ) + Math.abs( _cursorObj.x ) ) > 104 )
							)
					  )
						return true;

					return false;
				};
			}

			return this;
		},
		/*****************************
		* setJoint( NUMBER/STIRNG ), chainable added on vI
		* -----------------------------
		* sets cursor joint (please keep in mind that if you use a number it should be RELATIVE to the
		* already tracked joints)
		******************************/
		setJoint : function( index ) {
			if( typeof( index ) === "string" )
			{
				var tmp = kinect.getSetup().joints,
					len = tmp.length;

				while( len-- )
					if( tmp[ len ] === index )
					{
						this.joint = len;
						return this;
					}
			}
			else
				this.joint = index;

			return this;
		},
		/*****************************
		* useBothHands( BOOL ), chainable added on vI
		* -----------------------------
		* Use both hands, based on Z
		* Will default to null if both hands are
		* not tracked (see the _reg object)
		******************************/
		useBothHands : function( bool ) {
			if( bool )
			{
				var tmp = this.bothHands = {},
					joints = kinect.getSetup().joints,
					len = joints.length;

				while( len-- )
				{
					if( joints[ len ] == 'HAND_RIGHT' )
						this.bothHands.right = len;
					else if( joints[ len ] == 'HAND_LEFT' )
						this.bothHands.left = len;
				}

				if( !this.bothHands.right || !this.bothHands.left )
					this.bothHands = null;
			}
			else
				this.bothHands = null;

			return this;
		},
		/*****************************
		* activate(), chainable added on vI
		* -----------------------------
		* Activates the cursor
		******************************/
		activate : function() {
			var q = this;

			//stores the old relative val
			q.deactivateRelativeVal = kinect.getSetup().relative;
			kinect.setRelative( true );

			cursorStyle.display = "block";

			q.interval = setInterval( _calculatePos, q.step );
			q.status = true;
			return this;
		},
		/*****************************
		* deactivate(), chainable added on vI
		* -----------------------------
		* Deactivates the cursor (and hides it, but doesnot remove it)
		******************************/
		deactivate : function() {
			clearInterval( this.interval );
			this.interval = false;

			cursorStyle.display = "none";

			//restores relative val
			kinect.setRelative( this.deactivateRelativeVal );
			this.status = false;
			
			return this;
		},
		/*****************************
		* addRegion( OBJECT, NUMBER ), chainable added on vI
		* -----------------------------
		* Registers a region to interact with the cursor
		* object : dom element
		* number : (gravity - the cursor will move smoothly when above the element)
		******************************/
		addRegion : function( obj, gravity ) {
			!gravity && ( gravity = 0 )

			if( typeof obj === "string" )
			{
				var tmp = document.getElementById( obj );
				tmp.gravity = gravity;
				tmp == overlapArr.push( tmp );
			}
			else
			{
				obj.gravity = gravity;

				if( !obj.length )
					overlapArr.push( obj );
				else
				{
					var len = obj.length;
					while( len-- )
						overlapArr.push( obj[ len ] );
				}
			}
			return this;
		}
	},
	_cursorObj = kinect.cursor;
	//END
})( kinect );


/*********************************
* KINECT SNAPSHOT, 7/02/2012
*---------------------------------
* Takes a picture (RGB camera - base64 jpg)
* (bypasses http since it uses jsonp)
* -able to store it in localStorage
**********************************/
(function( kinect ) {
	var _readyStateChange = function() {
		var img = kinect.imageCommands.currentImageData;

		_callback && _callback( img );
		
		_headContainer.removeChild( _xmlhttp );

		_saveImage && localStorage.setItem( 'img_' + new Date().getTime(), img );

		_xmlhttp = img = _callback = _saveImage = null;

		return false;
	},
	_headContainer = document.getElementsByTagName( 'head' )[ 0 ],
	_xmlhttp = null,
	_saveImage	= null,
	_callback;

	/*********************************
	* snapshot( FUNCTION, FUNCTION ) chainable added on vI
	*---------------------------------
	* Returns base64 encoded image can save it to localStorage
	* with date / timestamp if required
	* - callback : Function - what to do with the image data (base64 jpg)
	* - errorcallback : Function - called on error
	**********************************/
	kinect.snapshot = function( callback, errorcallback ) {
		if( _xmlhttp || !kinect.address )
			errorcallback && errorcallback();
		else
		{
			_xmlhttp = document.createElement( 'script' );
			_xmlhttp.setAttribute( 'type', 'text/javascript' );
			_xmlhttp.setAttribute( 'defer', 'defer' );

			_callback = callback;
			_xmlhttp.onload = _readyStateChange;

			_xmlhttp.setAttribute( 'src', "http://" + kinect.address + "/?u=image#" + new Date().getTime() );
			_headContainer.appendChild( _xmlhttp );
		}

		return kinect.imageCommands;
	};

	kinect.imageCommands = {
		snapshot			:	kinect.snapshot,
		currentImageData	:	null,
		/*********************************
		* Saves image to localStorage if specified
		* example : kinect.snapshot(...).saveToLocalStorage();
		**********************************/
		saveToLocalStorage	: function() {
			_saveImage = true;

			return this;
		},
		/*********************************
		* removes item "name" from the localStorage - chainable
		**********************************/
		removeImage : function( name ) {
			localStorage.removeItem( name );

			return this;
		},
		/*********************************
		* purgeGallery( INT ) - returns imageArray added on vI
		* --------------------------------
		* Deletes images from the gallery (the oldest ones first) 
		* and keeps only as many as specified in its sole argument
		*
		* count (int) - how many pictures to keep
		* if left unspecified, defaults to 7
		**********************************/
		purgeGallery : function( count ) {
			var storage_len = localStorage.length,
				picture_holder = [],
				tmp,
				i,
				ret = [];
		
			if( count !== 0 )
				!count && ( count = 7 );
			
			for (i = 0; i < storage_len; ++i )	//grab the pictures from the localStorage
				if( localStorage.key( i ).indexOf('img_') !== -1 )
					picture_holder.push( localStorage.key( i ) );
			
			var slen = picture_holder.length;
			i = -1;
			if( slen > count )	//delete them if there are more than 7
			{
				tmp = slen - count;
				while( ++i < tmp )
				{
					localStorage.removeItem( picture_holder[ i ] );
					picture_holder[ i ] = null;
				}
			}
			
			for( i = 0, tmp = picture_holder.length; i < tmp; ++i )
				if( picture_holder[ i ] )
					ret.push( picture_holder[ i ] );
			
			storage_len = tmp = picture_holder = i = null;
			return ret;
		}
	};
})( kinect );

/*********************************
* KINECT SESSION, 7/02/2012
*---------------------------------
* Maintains websockets active between 
* page loads (of the same domain only)
**********************************/
(function( kinect ) {
	var _saveSession = function() {
		localStorage.setItem( 'kinect_session', kinect.address );
		return false;
	};
	/*********************************
	* sessionPersist( BOOLEAN ), chainable added on vI
	*---------------------------------
	* If BOOLEAN is set to true, then session will be maintained for the
	* main (joints) websocket
	**********************************/
	kinect.sessionPersist = function( bool ) {
		if( bool === false )
		{
			localStorage.removeItem( 'kinect_session' );
			kinect.removeEventListener( 'openedSocket', _saveSession );

			return this;
		}

		var session = localStorage.getItem( 'kinect_session' );
		kinect.addEventListener( 'openedSocket', _saveSession );

		setTimeout( function() {
			session && kinect.make( session );
		}, 1250 );

		return this;
	};
})( kinect );