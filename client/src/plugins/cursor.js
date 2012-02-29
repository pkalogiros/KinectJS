/*********************************
* KINECT CURSOR, 7/02/2012
*---------------------------------
* Default cursor object, controled by the first player always (the joint can be specified)
* and is able to dispatch events such as kinectTouchStart, kinectTouchMove
* kinectTouchEnd, kinectTouchPushStart, kinectTouchPushEnd - to specified regions
*
* :: WORK IN PROGRESS so a couple of things are bound to change
* proper documentation will be added soon
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